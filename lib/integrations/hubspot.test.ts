import { describe, expect, it } from "vitest";
import { createHubspot } from "./hubspot";
import { fakeFetch } from "./fake-fetch";
import { makeCall } from "../calls/fixtures";

const cfg = {
  token: "H",
  pipelineId: "default",
  dealStageId: "consult_booked",
  ownerId: "99",
  dashboardUrl: "https://example.test",
};

function hub(existingContact = false) {
  return fakeFetch([
    { method: "POST", match: "/crm/v3/objects/contacts/search", json: { total: existingContact ? 1 : 0, results: existingContact ? [{ id: "ct_old" }] : [] } },
    { method: "POST", match: "/crm/v3/objects/contacts", json: { id: "ct_1" } },
    { method: "PATCH", match: "/crm/v3/objects/contacts/", json: { id: "ct_old" } },
    { method: "POST", match: "/crm/v3/objects/calls", json: { id: "hc_1" } },
    { method: "PATCH", match: "/crm/v3/objects/calls/", json: { id: "hc_1" } },
    { method: "POST", match: "/crm/v3/objects/deals", json: { id: "dl_1" } },
    { method: "POST", match: "/crm/v3/objects/tasks", json: { id: "tk_1" } },
  ]);
}

const paths = (f: ReturnType<typeof hub>) => f.calls.map((c) => `${c.method} ${new URL(c.url).pathname}`);

describe("hubspot.syncCall", () => {
  it("logs a rejected call too: contact with route + close reason, and a call engagement, no deal", async () => {
    const f = hub();
    const hs = createHubspot({ ...cfg, fetch: f.fetch });
    const ids = await hs.syncCall(
      makeCall({ route: "close", closeReason: "outside_service_area", transcript: "Caller: I'm in Nashik" }),
    );
    expect(ids).toEqual({ contactId: "ct_1", callId: "hc_1", dealId: null, taskId: null });
    expect(paths(f)).toEqual([
      "POST /crm/v3/objects/contacts/search",
      "POST /crm/v3/objects/contacts",
      "POST /crm/v3/objects/calls",
    ]);
    expect(f.calls[1].body).toMatchObject({
      properties: {
        firstname: "Priya",
        phone: "+910000000001",
        city: "Kothrud",
        aangan_last_route: "close",
        aangan_close_reason: "outside_service_area",
      },
    });
    const callBody = f.calls[2].body as { properties: Record<string, string>; associations: unknown[] };
    expect(callBody.properties.hs_call_direction).toBe("INBOUND");
    expect(callBody.properties.hs_call_body).toContain("outside_service_area");
    expect(callBody.properties.hs_call_body).toContain("https://example.test/calls/c_1");
    expect(callBody.associations).toEqual([
      { to: { id: "ct_1" }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 194 }] },
    ]);
  });

  it("creates a deal at Consultation booked for a qualified, booked call", async () => {
    const f = hub();
    const hs = createHubspot({ ...cfg, fetch: f.fetch });
    const ids = await hs.syncCall(makeCall({ route: "qualified", bookingUid: "bk_1", bookingAt: new Date("2026-10-02T05:30:00Z") }));
    expect(ids.dealId).toBe("dl_1");
    const deal = f.calls.find((c) => c.url.endsWith("/crm/v3/objects/deals"))!.body as { properties: Record<string, string> };
    expect(deal.properties).toMatchObject({ pipeline: "default", dealstage: "consult_booked" });
    expect(deal.properties.dealname).toContain("Priya");
  });

  it("does not create a deal for a qualified call that never booked", async () => {
    const f = hub();
    const ids = await createHubspot({ ...cfg, fetch: f.fetch }).syncCall(makeCall({ route: "qualified" }));
    expect(ids.dealId).toBeNull();
  });

  it("creates a high-priority task for Nikhil on a complaint", async () => {
    const f = hub();
    const ids = await createHubspot({ ...cfg, fetch: f.fetch }).syncCall(makeCall({ route: "escalate" }));
    expect(ids.taskId).toBe("tk_1");
    const task = f.calls.find((c) => c.url.endsWith("/crm/v3/objects/tasks"))!.body as { properties: Record<string, string> };
    expect(task.properties).toMatchObject({ hs_task_priority: "HIGH", hubspot_owner_id: "99" });
  });

  it("updates instead of duplicating on a re-run", async () => {
    const f = hub();
    const ids = await createHubspot({ ...cfg, fetch: f.fetch }).syncCall(
      makeCall({ route: "qualified", hubspotContactId: "ct_old", hubspotCallId: "hc_1", bookingUid: "bk_1", hubspotDealId: "dl_1" }),
    );
    expect(ids).toEqual({ contactId: "ct_old", callId: "hc_1", dealId: "dl_1", taskId: null });
    expect(paths(f)).toEqual(["PATCH /crm/v3/objects/contacts/ct_old", "PATCH /crm/v3/objects/calls/hc_1"]);
  });

  it("reuses an existing contact found by phone (repeat caller)", async () => {
    const f = hub(true);
    const ids = await createHubspot({ ...cfg, fetch: f.fetch }).syncCall(makeCall({ route: "callback" }));
    expect(ids.contactId).toBe("ct_old");
    expect(paths(f)[1]).toBe("PATCH /crm/v3/objects/contacts/ct_old");
  });

  it("still logs the call when no number was captured", async () => {
    const f = hub();
    const ids = await createHubspot({ ...cfg, fetch: f.fetch }).syncCall(makeCall({ route: "dropped", callerNumber: null }));
    expect(ids).toEqual({ contactId: null, callId: "hc_1", dealId: null, taskId: null });
    expect(paths(f)).toEqual(["POST /crm/v3/objects/calls"]);
  });
});
