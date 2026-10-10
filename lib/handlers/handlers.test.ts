import { describe, expect, it, vi } from "vitest";
import { handleBook, handleCallEnded, handleQualify, handleSlots, type Deps } from "./index";
import { createMemoryRepo } from "../calls/memory-repo";
import { makeCall } from "../calls/fixtures";
import type { Assessment, CriterionKey, Verdict } from "../rubric/schema";
import type { CallRecord } from "../calls/types";

function assessment(v: Partial<Record<CriterionKey, Verdict>> = {}, extra: Partial<Assessment> = {}): Assessment {
  const c = (k: CriterionKey) => ({ verdict: v[k] ?? "pass", evidence: "" });
  return {
    criteria: {
      real_project: c("real_project"),
      service_area: c("service_area"),
      timeline: c("timeline"),
      budget: c("budget"),
      decision_maker: c("decision_maker"),
    },
    is_complaint: false,
    suggested_question: null,
    ...extra,
  };
}

function setup(opts: { seed?: CallRecord[]; result?: Assessment | Error } = {}) {
  const repo = createMemoryRepo(opts.seed);
  const pending: Promise<unknown>[] = [];
  const deps: Deps = {
    repo,
    assess: vi.fn(async () => {
      if (opts.result instanceof Error) throw opts.result;
      return { assessment: opts.result ?? assessment(), costUsd: 0.0004, latencyMs: 900 };
    }),
    calcom: {
      slots: vi.fn(async () => [
        { start: "2026-10-02T05:30:00.000Z", label: "Fri 2 Oct, 11:00 am" },
        { start: "2026-10-02T09:30:00.000Z", label: "Fri 2 Oct, 3:00 pm" },
      ]),
      book: vi.fn(async ({ start }) => ({ uid: "bk_1", start: new Date(start) })),
    },
    telegram: { send: vi.fn(async () => {}) },
    hubspot: {
      syncCall: vi.fn(async (c: CallRecord) => ({
        contactId: c.hubspotContactId ?? "ct_1",
        callId: c.hubspotCallId ?? "hc_1",
        dealId: c.bookingUid ? "dl_1" : null,
        taskId: c.route === "escalate" ? "tk_1" : null,
      })),
    },
    now: () => new Date("2026-10-01T17:00:00Z"),
    dashboardUrl: "https://example.test",
    defer: (fn) => void pending.push(fn()),
  };
  const flush = () => Promise.all(pending.splice(0));
  return { repo, deps, flush };
}

const qualifyBody = { call_id: "v_1", caller_number: "+910000000001", answers: { name: "Priya", locality: "Kothrud" } };

describe("handleQualify", () => {
  it("creates the call row, stores the assessment and tells the agent to offer slots", async () => {
    const { repo, deps } = setup();
    const res = await handleQualify(qualifyBody, deps);
    expect(res).toMatchObject({ route: "qualified", next_step: "offer_slots" });
    const [row] = repo.all();
    expect(row).toMatchObject({ vaaniCallId: "v_1", route: "qualified", afterHours: true, aiCostUsd: 0.0004, aiLatencyMs: 900 });
    expect(row.answers.locality).toBe("Kothrud");
  });

  it("merges answers across repeated qualify calls and counts the asked question", async () => {
    const { repo, deps } = setup({ result: assessment({ timeline: "unclear" }, { suggested_question: "When would you need it complete?" }) });
    const first = await handleQualify(qualifyBody, deps);
    expect(first).toMatchObject({ route: "ask", say: "When would you need it complete?" });
    await handleQualify({ call_id: "v_1", answers: { completion: "not sure" } }, deps);
    const [row] = repo.all();
    expect(row.answers).toMatchObject({ name: "Priya", completion: "not sure" });
    expect(row.askCount).toBe(1);
    expect(row.route).toBe("callback");
    expect(row.aiCostUsd).toBeCloseTo(0.0008);
  });

  it("closes gracefully without forwarding", async () => {
    const { deps, flush } = setup({ result: assessment({ service_area: "fail" }) });
    const res = await handleQualify(qualifyBody, deps);
    expect(res.route).toBe("close");
    expect(res.say).toMatch(/Pune/);
    await flush();
    expect(deps.telegram.send).not.toHaveBeenCalled();
  });

  it("sends an urgent Telegram right away for a complaint", async () => {
    const { repo, deps, flush } = setup({ result: assessment({}, { is_complaint: true }) });
    const res = await handleQualify(qualifyBody, deps);
    expect(res.route).toBe("escalate");
    await flush();
    expect(deps.telegram.send).toHaveBeenCalledWith(expect.stringMatching(/^URGENT/));
    expect(repo.all()[0].telegramSentAt).not.toBeNull();
  });

  it("falls back to a senior callback when the model fails or times out", async () => {
    const { repo, deps } = setup({ result: new Error("timeout") });
    const res = await handleQualify(qualifyBody, deps);
    expect(res.route).toBe("callback");
    expect(repo.all()[0].route).toBe("callback");
  });
});

describe("handleSlots", () => {
  it("returns spoken-friendly slots", async () => {
    const { deps } = setup();
    const res = await handleSlots({ call_id: "v_1" }, deps);
    expect(res.slots).toHaveLength(2);
    expect(res.say).toContain("Fri 2 Oct, 11:00 am");
  });
});

describe("handleBook", () => {
  it("books a qualified caller and sends the designer handoff note", async () => {
    const { repo, deps, flush } = setup({ seed: [makeCall({ vaaniCallId: "v_1", route: "qualified" })] });
    const res = await handleBook({ call_id: "v_1", slot_start: "2026-10-02T05:30:00Z" }, deps);
    expect(res).toMatchObject({ booked: true });
    expect(res.say).toContain("Fri 2 Oct, 11:00 am");
    await flush();
    expect(deps.telegram.send).toHaveBeenCalledWith(expect.stringContaining("Priya"));
    expect(repo.all()[0]).toMatchObject({ bookingUid: "bk_1" });
    expect(repo.all()[0].telegramSentAt).not.toBeNull();
  });

  it("refuses to book a caller who did not qualify", async () => {
    const { deps } = setup({ seed: [makeCall({ vaaniCallId: "v_1", route: "close" })] });
    const res = await handleBook({ call_id: "v_1", slot_start: "2026-10-02T05:30:00Z" }, deps);
    expect(res.booked).toBe(false);
    expect(deps.calcom.book).not.toHaveBeenCalled();
  });
});

describe("handleCallEnded", () => {
  const ended = { call_id: "v_1", ended_at: "2026-10-01T17:04:00Z", duration_sec: 240, transcript: "Agent: hi\nCaller: hello" };

  it("syncs every call to HubSpot, including rejected ones", async () => {
    const { repo, deps } = setup({ seed: [makeCall({ vaaniCallId: "v_1", route: "close", closeReason: "outside_service_area" })] });
    const res = await handleCallEnded(ended, deps);
    expect(res.ok).toBe(true);
    expect(deps.hubspot.syncCall).toHaveBeenCalledWith(expect.objectContaining({ route: "close", transcript: "Agent: hi\nCaller: hello" }));
    expect(repo.all()[0]).toMatchObject({ hubspotContactId: "ct_1", hubspotCallId: "hc_1", durationSec: 240, voiceMinutes: 4 });
  });

  it("marks a call that ended before a decision as dropped and asks for a call back", async () => {
    const { repo, deps } = setup({ seed: [makeCall({ vaaniCallId: "v_1", route: "ask" })] });
    await handleCallEnded(ended, deps);
    expect(repo.all()[0].route).toBe("dropped");
    expect(deps.telegram.send).toHaveBeenCalledWith(expect.stringMatching(/call back/i));
  });

  it("creates a row for a call that never reached qualify", async () => {
    const { repo, deps } = setup();
    await handleCallEnded({ ...ended, caller_number: "+910000000009", started_at: "2026-10-01T17:00:00Z" }, deps);
    expect(repo.all()[0]).toMatchObject({ route: "dropped", callerNumber: "+910000000009" });
    expect(deps.hubspot.syncCall).toHaveBeenCalled();
  });

  it("sends a handoff note for a qualified caller who did not book", async () => {
    const { deps } = setup({ seed: [makeCall({ vaaniCallId: "v_1", route: "qualified" })] });
    await handleCallEnded(ended, deps);
    expect(deps.telegram.send).toHaveBeenCalledWith(expect.stringContaining("not booked"));
  });

  it("does not resend Telegram when the note already went out", async () => {
    const { deps } = setup({ seed: [makeCall({ vaaniCallId: "v_1", route: "qualified", telegramSentAt: new Date() })] });
    await handleCallEnded(ended, deps);
    expect(deps.telegram.send).not.toHaveBeenCalled();
  });

  it("still saves HubSpot ids when Telegram fails, and reports the failure", async () => {
    const { repo, deps } = setup({ seed: [makeCall({ vaaniCallId: "v_1", route: "dropped" })] });
    deps.telegram.send = vi.fn(async () => {
      throw new Error("telegram down");
    });
    const res = await handleCallEnded(ended, deps);
    expect(res.ok).toBe(false);
    expect(res.errors).toEqual([expect.stringContaining("telegram down")]);
    expect(repo.all()[0].hubspotCallId).toBe("hc_1");
  });
});
