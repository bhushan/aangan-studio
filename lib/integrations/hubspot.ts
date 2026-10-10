import type { CallRecord } from "../calls/types";
import { CRITERIA } from "../rubric/schema";
import { formatSlot } from "../time";

const BASE = "https://api.hubapi.com/crm/v3/objects";

// HubSpot-defined association type ids (object -> contact).
const ASSOC = { call: 194, deal: 3, task: 204 } as const;

// Custom contact properties created by scripts/hubspot-setup.ts.
export const CONTACT_PROPERTIES = [
  { name: "aangan_last_route", label: "Aangan: last call route" },
  { name: "aangan_close_reason", label: "Aangan: close reason" },
  { name: "aangan_project_type", label: "Aangan: project type" },
] as const;

export type HubspotIds = { contactId: string | null; callId: string | null; dealId: string | null; taskId: string | null };
export type SaveIds = (ids: Partial<HubspotIds>) => Promise<void>;
/** `save` persists each id as soon as it exists, so a later failure never causes a duplicate on retry. */
export type Hubspot = { syncCall(call: CallRecord, save?: SaveIds): Promise<HubspotIds> };

type Cfg = {
  token: string;
  pipelineId: string;
  dealStageId: string;
  ownerId: string;
  dashboardUrl: string;
  fetch?: typeof fetch;
};

const assoc = (contactId: string | null, typeId: number) =>
  contactId ? [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: typeId }] }] : [];

function callBody(c: CallRecord, dashboardUrl: string): string {
  const lines = [`Route: ${c.route ?? "unknown"}${c.closeReason ? ` (${c.closeReason})` : ""}`];
  if (c.afterHours) lines.push("After hours");
  if (c.flags.length) lines.push(`Flags: ${c.flags.join(", ")}`);
  if (c.bookingAt) lines.push(`Consultation: ${formatSlot(c.bookingAt)}`);
  if (c.assessment) {
    lines.push("", "Criteria:");
    for (const k of CRITERIA) {
      const { verdict, evidence } = c.assessment.criteria[k];
      lines.push(`- ${k}: ${verdict}${evidence ? ` (${evidence})` : ""}`);
    }
  }
  const a = c.answers;
  lines.push(
    "",
    `Area: ${a.locality ?? "-"} | Type: ${a.property_type ?? "-"} | Size: ${a.size_sqft ?? "-"} sq ft`,
    `Scope: ${a.scope ?? "-"}`,
    `Timeline: ${a.completion ?? "-"} | Decider: ${a.decision_maker ?? "-"}`,
  );
  if (a.budget_volunteered) lines.push(`Budget (volunteered): ${a.budget_volunteered}`);
  if (a.notes) lines.push(`Notes: ${a.notes}`);
  lines.push("", `Transcript: ${dashboardUrl}/calls/${c.id}`);
  return lines.join("\n");
}

export function createHubspot(cfg: Cfg): Hubspot {
  const f = cfg.fetch ?? fetch;

  async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await f(`${BASE}${path}`, {
      method,
      headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as T & { message?: string };
    if (!res.ok) throw new Error(`HubSpot ${method} ${path}: ${json.message ?? res.status}`);
    return json;
  }

  async function upsertContact(c: CallRecord): Promise<string | null> {
    if (!c.callerNumber) return null;
    const properties = {
      phone: c.callerNumber,
      ...(c.answers.name ? { firstname: c.answers.name } : {}),
      ...(c.answers.locality ? { city: c.answers.locality } : {}),
      ...(c.answers.property_type ? { aangan_project_type: c.answers.property_type } : {}),
      aangan_last_route: c.route ?? "",
      aangan_close_reason: c.closeReason ?? "",
    };
    let id = c.hubspotContactId;
    if (!id) {
      const found = await api<{ results: { id: string }[] }>("POST", "/contacts/search", {
        filterGroups: [{ filters: [{ propertyName: "phone", operator: "EQ", value: c.callerNumber }] }],
        limit: 1,
      });
      id = found.results[0]?.id ?? null;
    }
    if (id) {
      await api("PATCH", `/contacts/${id}`, { properties });
      return id;
    }
    return (await api<{ id: string }>("POST", "/contacts", { properties })).id;
  }

  return {
    async syncCall(c, save = async () => {}) {
      const contactId = await upsertContact(c);
      if (contactId !== c.hubspotContactId) await save({ contactId });

      const callProps = {
        hs_timestamp: c.startedAt.toISOString(),
        hs_call_title: `Inbound enquiry: ${c.route ?? "in progress"}`,
        hs_call_body: callBody(c, cfg.dashboardUrl),
        hs_call_direction: "INBOUND",
        hs_call_status: "COMPLETED",
        ...(c.durationSec ? { hs_call_duration: String(c.durationSec * 1000) } : {}),
        ...(c.callerNumber ? { hs_call_from_number: c.callerNumber } : {}),
      };
      const callId = c.hubspotCallId
        ? (await api("PATCH", `/calls/${c.hubspotCallId}`, { properties: callProps }), c.hubspotCallId)
        : (await api<{ id: string }>("POST", "/calls", { properties: callProps, associations: assoc(contactId, ASSOC.call) })).id;
      if (callId !== c.hubspotCallId) await save({ callId });

      let dealId = c.hubspotDealId;
      if (!dealId && c.bookingUid && (c.route === "qualified" || c.route === "qualified_flagged")) {
        const deal = await api<{ id: string }>("POST", "/deals", {
          properties: {
            dealname: `${c.answers.name ?? "Caller"}: ${c.answers.locality ?? ""} ${c.answers.property_type ?? ""}`.trim(),
            pipeline: cfg.pipelineId,
            dealstage: cfg.dealStageId,
            ...(c.bookingAt ? { closedate: c.bookingAt.toISOString() } : {}),
          },
          associations: assoc(contactId, ASSOC.deal),
        });
        dealId = deal.id;
        await save({ dealId });
      }

      let taskId = c.hubspotTaskId;
      if (!taskId && c.route === "escalate") {
        const task = await api<{ id: string }>("POST", "/tasks", {
          properties: {
            hs_timestamp: new Date(c.startedAt.getTime() + 15 * 60 * 1000).toISOString(),
            hs_task_subject: `Complaint: call ${c.answers.name ?? c.callerNumber ?? "caller"} back within 15 minutes`,
            hs_task_body: callBody(c, cfg.dashboardUrl),
            hs_task_priority: "HIGH",
            hs_task_status: "NOT_STARTED",
            hubspot_owner_id: cfg.ownerId,
          },
          associations: assoc(contactId, ASSOC.task),
        });
        taskId = task.id;
        await save({ taskId });
      }

      return { contactId, callId, dealId, taskId };
    },
  };
}
