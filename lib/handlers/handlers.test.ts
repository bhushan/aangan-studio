import { describe, expect, it, vi } from "vitest";
import { handleBook, handleQualify, handleSlots, handleWebhook, type Deps } from "./index";
import { createMemoryRepo } from "../calls/memory-repo";
import { makeCall } from "../calls/fixtures";
import type { Answers, Assessment, CriterionKey, Verdict } from "../rubric/schema";
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

function setup(opts: { seed?: CallRecord[]; result?: Assessment | Error; review?: { answers: Answers; assessment: Assessment } | Error } = {}) {
  const repo = createMemoryRepo(opts.seed);
  const pending: Promise<unknown>[] = [];
  const deps: Deps = {
    repo,
    assess: vi.fn(async () => {
      if (opts.result instanceof Error) throw opts.result;
      return { assessment: opts.result ?? assessment(), costUsd: 0.0004, latencyMs: 900 };
    }),
    review: vi.fn(async () => {
      if (opts.review instanceof Error) throw opts.review;
      return { ...(opts.review ?? { answers: {}, assessment: assessment() }), costUsd: 0.001 };
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
    sleep: async () => {},
  };
  const flush = () => Promise.all(pending.splice(0));
  return { repo, deps, flush };
}

const qualifyBody = {
  call_id: "v_1",
  caller_number: "+910000000001",
  answers: { name: "Priya", locality: "Kothrud", scope: "Full 3BHK redesign with execution", completion: "March 2027" },
};

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
    expect(row.askedAbout).toEqual(["timeline"]);
    expect(row.route).toBe("callback");
    expect(row.aiCostUsd).toBeCloseTo(0.0008);
  });

  it("sends an empty form back to the agent instead of judging it", async () => {
    const { repo, deps } = setup({ result: assessment({ service_area: "unclear" }) });
    const res = await handleQualify({ call_id: "v_1", name: "", locality: "" }, deps);
    expect(res).toMatchObject({ next_step: "resend_details", say: "" });
    expect(deps.assess).not.toHaveBeenCalled();
    const [row] = repo.all();
    expect(row).toMatchObject({ route: null, askedAbout: [] });
  });

  it("judges details collected earlier in the call even when this request adds none", async () => {
    const { deps } = setup();
    await handleQualify(qualifyBody, deps);
    const res = await handleQualify({ call_id: "v_1" }, deps);
    expect(res.next_step).toBe("offer_slots");
    expect(deps.assess).toHaveBeenCalledTimes(2);
  });

  it("collects area, scope and completion before qualifying anyone", async () => {
    const { repo, deps } = setup();
    const res = await handleQualify({ call_id: "v_1", answers: { name: "Puja", locality: "Baner" } }, deps);
    expect(res).toMatchObject({ route: "ask", next_step: "ask", ask_about: "real_project" });
    expect(res.say).toMatch(/what would you like/i);
    expect(repo.all()[0]).toMatchObject({ route: "ask", requested: ["real_project"], askedAbout: [] });
  });

  it("closes at once on a clear fail, even with details still missing", async () => {
    const { deps } = setup({ result: assessment({ service_area: "fail" }) });
    const res = await handleQualify({ call_id: "v_1", answers: { name: "Puja", locality: "Nashik" } }, deps);
    expect(res).toMatchObject({ route: "close", next_step: "end_call" });
  });

  it("never holds back a complaint to collect project details", async () => {
    const { deps } = setup({ result: assessment({}, { is_complaint: true }) });
    const res = await handleQualify({ call_id: "v_1", answers: { name: "Ravi", locality: "Baner", notes: "Existing client, designer not replying" } }, deps);
    expect(res.route).toBe("escalate");
  });

  it("judges on what it has once a requested detail still did not arrive", async () => {
    const { repo, deps } = setup();
    await handleQualify({ call_id: "v_1", answers: { name: "Puja", locality: "Baner" } }, deps);
    const res = await handleQualify({ call_id: "v_1", answers: { completion: "March" } }, deps);
    expect(res.route).toBe("qualified");
    expect(repo.all()[0].requested).toEqual(["real_project"]);
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

describe("call records", () => {
  it("leaves answeredAt empty until Vaani reports the pickup", async () => {
    const { repo, deps } = setup();
    await handleWebhook({ event: "call_started", room_name: "v_1", phone_number: "+910000000001" }, deps);
    expect(repo.all()[0].answeredAt).toBeNull();
    await handleWebhook({ event: "user_picked_up_at", room_name: "v_1" }, deps);
    expect(repo.all()[0].answeredAt).toEqual(new Date("2026-10-01T17:00:00Z"));
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

describe("Cal.com failures mid-call", () => {
  it("slots falls back to a designer callback instead of failing the tool", async () => {
    const { deps } = setup();
    deps.calcom.slots = vi.fn(async () => {
      throw new Error("Cal.com slots: 503");
    });
    const res = await handleSlots({ call_id: "v_1" }, deps);
    expect(res.slots).toEqual([]);
    expect(res.say).toMatch(/designer call you back/);
  });

  it("book says the slot could not be held, and the call stays qualified for the handoff note", async () => {
    const { repo, deps } = setup({ seed: [makeCall({ vaaniCallId: "v_1", route: "qualified" })] });
    deps.calcom.book = vi.fn(async () => {
      throw new Error("Cal.com booking: slot taken");
    });
    const res = await handleBook({ call_id: "v_1", slot_start: "2026-10-02T05:30:00Z" }, deps);
    expect(res.booked).toBe(false);
    expect(res.say).toMatch(/couldn't hold that slot/);
    expect(repo.all()[0]).toMatchObject({ route: "qualified", bookingUid: null });
  });
});

describe("handleBook", () => {
  it("never lets the agent claim a booking when the slot did not arrive", async () => {
    const { deps } = setup({ seed: [makeCall({ vaaniCallId: "v_1", route: "qualified" })] });
    const res = await handleBook({ call_id: "v_1" }, deps);
    expect(res).toMatchObject({ booked: false });
    expect(res.say).toMatch(/couldn't hold that slot/i);
    expect(deps.calcom.book).not.toHaveBeenCalled();
  });

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

  it("does not book twice if the agent repeats the tool call", async () => {
    const { deps } = setup({
      seed: [makeCall({ vaaniCallId: "v_1", route: "qualified", bookingUid: "bk_1", bookingAt: new Date("2026-10-02T05:30:00Z") })],
    });
    const res = await handleBook({ call_id: "v_1", slot_start: "2026-10-03T05:30:00Z" }, deps);
    expect(res).toMatchObject({ booked: true });
    expect(res.say).toContain("Fri 2 Oct, 11:00 am");
    expect(deps.calcom.book).not.toHaveBeenCalled();
  });

  it("refuses to book a caller who did not qualify", async () => {
    const { deps } = setup({ seed: [makeCall({ vaaniCallId: "v_1", route: "close" })] });
    const res = await handleBook({ call_id: "v_1", slot_start: "2026-10-02T05:30:00Z" }, deps);
    expect(res.booked).toBe(false);
    expect(deps.calcom.book).not.toHaveBeenCalled();
  });
});

describe("handleWebhook", () => {
  const ended = { event: "call_ended", room_name: "v_1", call_duration: 240 };
  const post = {
    event: "call_postprocessing",
    call_id: "v_1",
    data: { room_name: "v_1", call_duration: 240000, transcript: "[10:00:00] AGENT: hi\n\n[10:00:02] USER: hello" },
  };

  it("creates the call row on call_started with the caller's number", async () => {
    const { repo, deps } = setup();
    await handleWebhook({ event: "call_started", room_name: "v_9", phone_number: "+910000000009" }, deps);
    expect(repo.all()[0]).toMatchObject({ vaaniCallId: "v_9", callerNumber: "+910000000009", afterHours: true });
  });

  it("syncs every call to HubSpot on call_ended, including rejected ones", async () => {
    const { repo, deps } = setup({ seed: [makeCall({ vaaniCallId: "v_1", route: "close", closeReason: "outside_service_area" })] });
    const res = await handleWebhook(ended, deps);
    expect(res.ok).toBe(true);
    expect(deps.hubspot.syncCall).toHaveBeenCalledWith(expect.objectContaining({ route: "close" }), expect.any(Function));
    expect(repo.all()[0]).toMatchObject({ hubspotContactId: "ct_1", hubspotCallId: "hc_1", durationSec: 240, voiceMinutes: 4 });
  });

  it("adds the transcript on call_postprocessing and re-syncs HubSpot without a second Telegram", async () => {
    const { repo, deps } = setup({ seed: [makeCall({ vaaniCallId: "v_1", route: "qualified" })] });
    await handleWebhook(ended, deps);
    await handleWebhook(post, deps);
    expect(repo.all()[0].transcript).toBe("[10:00:00] Agent: hi\n[10:00:02] Caller: hello");
    expect(deps.hubspot.syncCall).toHaveBeenCalledTimes(2);
    expect(deps.hubspot.syncCall).toHaveBeenLastCalledWith(expect.objectContaining({ transcript: expect.stringContaining("Agent: hi") }), expect.any(Function));
    expect(deps.telegram.send).toHaveBeenCalledTimes(1);
  });

  it("reviews the transcript once, fills details the agent missed, and flags a wrong outcome", async () => {
    const { repo, deps } = setup({
      seed: [makeCall({ vaaniCallId: "v_1", route: "callback", answers: { name: "Puja" } })],
      review: { answers: { name: "Pooja", locality: "Nashik", completion: "in fifteen days" }, assessment: assessment({ service_area: "fail" }) },
    });
    await handleWebhook(ended, deps);
    await handleWebhook(post, deps);
    await handleWebhook(post, deps);
    expect(deps.review).toHaveBeenCalledTimes(1);
    const row = repo.all()[0];
    expect(row.route).toBe("callback"); // what the caller was told stays on record
    expect(row.answers).toMatchObject({ name: "Puja", locality: "Nashik", completion: "in fifteen days" });
    expect(row.review).toMatchObject({ route: "close", closeReason: "outside_service_area", filled: ["locality", "completion"] });
    expect(row.review!.note).toMatch(/likely not a fit/i);
    expect(deps.telegram.send).toHaveBeenLastCalledWith(expect.stringMatching(/^Review of Puja's call[\s\S]*likely not a fit/i));
    expect(deps.hubspot.syncCall).toHaveBeenLastCalledWith(expect.objectContaining({ review: expect.objectContaining({ route: "close" }) }), expect.any(Function));
  });

  it("sends no extra note when the review agrees", async () => {
    const { deps } = setup({ seed: [makeCall({ vaaniCallId: "v_1", route: "qualified" })] });
    await handleWebhook(ended, deps);
    await handleWebhook(post, deps);
    expect(deps.review).toHaveBeenCalledTimes(1);
    expect(deps.telegram.send).toHaveBeenCalledTimes(1);
  });

  it("still finishes the call when the review fails, and reports it", async () => {
    const { repo, deps } = setup({ seed: [makeCall({ vaaniCallId: "v_1", route: "qualified" })], review: new Error("gemini down") });
    const res = await handleWebhook(post, deps);
    expect(res.errors).toEqual([expect.stringContaining("review: gemini down")]);
    expect(repo.all()[0].hubspotCallId).toBe("hc_1");
  });

  it("marks a call that ended before a decision as dropped and asks for a call back", async () => {
    const { repo, deps } = setup({ seed: [makeCall({ vaaniCallId: "v_1", route: "ask" })] });
    await handleWebhook(ended, deps);
    expect(repo.all()[0].route).toBe("dropped");
    expect(deps.telegram.send).toHaveBeenCalledWith(expect.stringMatching(/call back/i));
  });

  it("sends a handoff note for a qualified caller who did not book", async () => {
    const { deps } = setup({ seed: [makeCall({ vaaniCallId: "v_1", route: "qualified" })] });
    await handleWebhook(ended, deps);
    expect(deps.telegram.send).toHaveBeenCalledWith(expect.stringContaining("not booked"));
  });

  it("does not resend Telegram when the note already went out", async () => {
    const { deps } = setup({ seed: [makeCall({ vaaniCallId: "v_1", route: "qualified", telegramSentAt: new Date() })] });
    await handleWebhook(ended, deps);
    expect(deps.telegram.send).not.toHaveBeenCalled();
  });

  it("still saves HubSpot ids when Telegram fails, and reports the failure", async () => {
    const { repo, deps } = setup({ seed: [makeCall({ vaaniCallId: "v_1", route: "dropped" })] });
    deps.telegram.send = vi.fn(async () => {
      throw new Error("telegram down");
    });
    const res = await handleWebhook(ended, deps);
    expect(res.ok).toBe(false);
    expect(res.errors).toEqual([expect.stringContaining("telegram down")]);
    expect(repo.all()[0].hubspotCallId).toBe("hc_1");
  });

  it("sends one Telegram note and one HubSpot sync when call_ended and call_postprocessing overlap", async () => {
    const { deps } = setup({ seed: [makeCall({ vaaniCallId: "v_1", route: "qualified" })] });
    await Promise.all([handleWebhook(ended, deps), handleWebhook(post, deps)]);
    expect(deps.telegram.send).toHaveBeenCalledTimes(1);
    // The lock holder re-syncs once if the other event changed the call (here: the transcript).
    expect(deps.hubspot.syncCall).toHaveBeenLastCalledWith(expect.objectContaining({ transcript: expect.stringContaining("Agent: hi") }), expect.any(Function));
  });

  it("keeps HubSpot ids created before a later HubSpot step failed", async () => {
    const { repo, deps } = setup({ seed: [makeCall({ vaaniCallId: "v_1", route: "escalate" })] });
    deps.hubspot.syncCall = vi.fn(async (_c: CallRecord, save?: (ids: Partial<Record<string, string | null>>) => Promise<void>) => {
      await save?.({ contactId: "ct_1", callId: "hc_1" });
      throw new Error("task create failed");
    });
    const res = await handleWebhook(ended, deps);
    expect(res.errors).toEqual(expect.arrayContaining([expect.stringContaining("task create failed")]));
    expect(repo.all()[0]).toMatchObject({ hubspotContactId: "ct_1", hubspotCallId: "hc_1" });
  });

  it("does not overwrite a decision reached while the caller hung up", async () => {
    const { repo, deps } = setup({ seed: [makeCall({ vaaniCallId: "v_1", route: null })] });
    const real = deps.repo.markDroppedIfUnfinished.bind(deps.repo);
    deps.repo.markDroppedIfUnfinished = async (id) => {
      await deps.repo.update(id, { route: "qualified" }); // qualify lands just before the drop check
      return real(id);
    };
    await handleWebhook(ended, deps);
    expect(repo.all()[0].route).toBe("qualified");
  });

  it("acknowledges a connectivity test or unknown event without a call id", async () => {
    const { repo, deps } = setup();
    expect(await handleWebhook({ event: "test" }, deps)).toEqual({ ok: true, errors: [] });
    expect(await handleWebhook({ ping: true }, deps)).toEqual({ ok: true, errors: [] });
    expect(repo.all()).toHaveLength(0);
  });

  it("acknowledges events it does not use", async () => {
    const { deps } = setup();
    expect(await handleWebhook({ event: "call_ringing", room_name: "v_1" }, deps)).toEqual({ ok: true, errors: [] });
  });
});

describe("tools with a call id the agent made up", () => {
  it("attach to the open call instead of creating a stray row", async () => {
    const { repo, deps } = setup({
      seed: [makeCall({ id: "live", vaaniCallId: "room-real", startedAt: new Date("2026-10-01T16:58:00Z"), answers: {} })],
    });
    await handleQualify({ call_id: "call123", name: "Priya", locality: "Kothrud" }, deps);
    expect(repo.all()).toHaveLength(1);
    expect(repo.all()[0]).toMatchObject({ id: "live", answers: { name: "Priya" } });
  });
});

describe("tools without a call id", () => {
  it("attach to the call that is currently open", async () => {
    const { repo, deps } = setup({
      seed: [
        makeCall({ id: "old", vaaniCallId: "v_old", startedAt: new Date("2026-10-01T15:00:00Z"), endedAt: new Date("2026-10-01T15:05:00Z") }),
        makeCall({ id: "live", vaaniCallId: "v_live", startedAt: new Date("2026-10-01T16:58:00Z"), answers: {} }),
      ],
    });
    await handleQualify({ name: "Priya", locality: "Kothrud", scope: "Kitchen redesign with execution", completion: "March" }, deps);
    const live = repo.all().find((c) => c.id === "live")!;
    expect(live).toMatchObject({ route: "qualified", answers: { name: "Priya", locality: "Kothrud" } });
    expect(repo.all()).toHaveLength(2);
  });
});
