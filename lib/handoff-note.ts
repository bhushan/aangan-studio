import type { CallRecord } from "./calls/types";
import { formatSlot } from "./time";

const FLAG_LABEL = { budget: "budget", decision_maker: "decision-maker", real_project: "scope", service_area: "area", timeline: "timeline" } as const;

function headline(c: CallRecord): string {
  const who = c.answers.name ?? "Unknown caller";
  switch (c.route) {
    case "escalate":
      return `URGENT: complaint from ${who}. Senior callback promised within 15 minutes.`;
    case "dropped":
      return `Please call back: ${who}'s call dropped before we finished.`;
    case "callback":
      return `Please call back: ${who} needs a senior person to take this forward.`;
    default:
      return c.bookingAt ? `New consultation booked: ${who}` : `Qualified lead, not booked yet: ${who}`;
  }
}

/** Telegram note for designers: everything the front desk would otherwise re-ask. */
export function buildHandoffNote(
  c: CallRecord,
  opts: { dashboardUrl: string; priorCalls: CallRecord[] },
): string {
  const a = c.answers;
  const lines = [
    headline(c),
    "",
    `Name: ${a.name ?? "not given"}`,
    `Number: ${c.callerNumber ?? "not captured"}`,
    `Project: ${a.property_type ?? "not given"}${a.size_sqft ? `, ${a.size_sqft} sq ft` : ""}`,
    `Area: ${a.locality ?? "not given"}`,
    `Scope: ${a.scope ?? "not given"}`,
    `Timeline: ${a.completion ?? "not given"}`,
    `Decider: ${a.decision_maker ?? "not given"}`,
  ];
  if (a.budget_volunteered) lines.push(`Budget (volunteered): ${a.budget_volunteered}`);
  if (a.notes) lines.push(`Notes: ${a.notes}`);
  if (c.bookingAt) lines.push(`Consultation: ${formatSlot(c.bookingAt)}`);
  for (const f of c.flags) lines.push(`Flag: ${FLAG_LABEL[f]} unclear`);
  if (opts.priorCalls.length) {
    const n = opts.priorCalls.length;
    lines.push(`Called before: ${n} time${n > 1 ? "s" : ""} (last ${formatSlot(opts.priorCalls[0].startedAt)})`);
  }
  lines.push(`Call: ${formatSlot(c.startedAt)}${c.afterHours ? " (after hours)" : ""}`);
  lines.push(`Transcript: ${opts.dashboardUrl}/calls/${c.id}`);
  return lines.join("\n");
}
