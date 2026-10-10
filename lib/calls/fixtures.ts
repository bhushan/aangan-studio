import type { CallRecord } from "./types";

// Fictional caller used across tests. Numbers use the reserved +91 00000 range.
export function makeCall(overrides: Partial<CallRecord> = {}): CallRecord {
  return {
    id: "c_1",
    vaaniCallId: "v_1",
    callerNumber: "+910000000001",
    startedAt: new Date("2026-10-01T17:00:00Z"), // 10:30pm IST
    answeredAt: new Date("2026-10-01T17:00:03Z"),
    endedAt: null,
    afterHours: true,
    answers: {
      name: "Priya",
      locality: "Kothrud",
      property_type: "home",
      scope: "Full 3BHK redesign: kitchen, living room, two bedrooms",
      size_sqft: 1400,
      completion: "March 2027",
      decision_maker: "Owner, spouse agrees",
      budget_volunteered: null,
      notes: null,
    },
    assessment: null,
    route: null,
    closeReason: null,
    flags: [],
    askCount: 0,
    bookingUid: null,
    bookingAt: null,
    hubspotContactId: null,
    hubspotCallId: null,
    hubspotDealId: null,
    hubspotTaskId: null,
    telegramSentAt: null,
    transcript: null,
    durationSec: null,
    voiceMinutes: null,
    aiCostUsd: null,
    aiLatencyMs: null,
    ...overrides,
  };
}
