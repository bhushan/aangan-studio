import { describe, expect, it } from "vitest";
import { makeCall } from "./calls/fixtures";
import { computeMetrics, followUps, inView, parseView, rangeStart, type RangeKey } from "./metrics";

const t = (iso: string) => new Date(iso);
const rates = { inrPerVoiceMinute: 5.5, inrPerUsd: 88 };

const calls = [
  makeCall({ id: "a", route: "qualified", bookingUid: "b1", bookingAt: t("2026-10-05T05:00:00Z"), voiceMinutes: 3, aiCostUsd: 0.002 }),
  makeCall({ id: "b", route: "qualified_flagged", flags: ["budget"], voiceMinutes: 2, aiCostUsd: 0.001, afterHours: false }),
  makeCall({ id: "c", route: "close", closeReason: "outside_service_area", voiceMinutes: 1, aiCostUsd: 0.001 }),
  makeCall({ id: "d", route: "close", closeReason: "outside_service_area", voiceMinutes: 1, afterHours: false }),
  makeCall({ id: "e", route: "escalate", voiceMinutes: 2 }),
  // Answered 6 minutes after the ring: counts against the 5-minute rate.
  makeCall({ id: "f", route: "dropped", startedAt: t("2026-10-01T17:00:00Z"), answeredAt: t("2026-10-01T17:06:00Z"), voiceMinutes: 1 }),
];

describe("computeMetrics", () => {
  const m = computeMetrics(calls, rates);

  it("counts calls, after-hours calls and the 5-minute answer rate", () => {
    expect(m.total).toBe(6);
    expect(m.afterHours).toBe(4);
    expect(m.answeredIn5Min).toBe(5);
    expect(m.answeredIn5MinRate).toBeCloseTo(5 / 6);
  });

  it("counts qualified (flagged included) and booked consultations", () => {
    expect(m.qualified).toBe(2);
    expect(m.qualifiedRate).toBeCloseTo(2 / 6);
    expect(m.booked).toBe(1);
  });

  it("groups outcomes and close reasons, most common first", () => {
    expect(m.outcomes).toMatchObject({ qualified: 1, qualified_flagged: 1, close: 2, escalate: 1, dropped: 1 });
    expect(m.closeReasons).toEqual([{ reason: "outside_service_area", count: 2 }]);
  });

  it("adds voice minutes and AI cost in rupees, per call and per booking", () => {
    expect(m.cost.voiceMinutes).toBe(10);
    expect(m.cost.voiceInr).toBeCloseTo(55);
    expect(m.cost.aiInr).toBeCloseTo(0.004 * 88);
    expect(m.cost.totalInr).toBeCloseTo(55 + 0.352);
    expect(m.cost.perCallInr).toBeCloseTo((55 + 0.352) / 6);
    expect(m.cost.perBookingInr).toBeCloseTo(55 + 0.352);
  });

  it("values booked consultations at ₹8 to 14 lakh each", () => {
    expect(m.pipelineInr).toEqual({ low: 800_000, high: 1_400_000 });
  });

  it("returns null rates instead of dividing by zero when there are no calls", () => {
    const empty = computeMetrics([], rates);
    expect(empty).toMatchObject({ total: 0, answeredIn5MinRate: null, qualifiedRate: null });
    expect(empty.cost.perCallInr).toBeNull();
    expect(empty.cost.perBookingInr).toBeNull();
  });
});

describe("followUps", () => {
  it("lists complaints first, then callbacks, dropped calls and qualified callers who did not book", () => {
    const list = followUps([
      makeCall({ id: "drop", route: "dropped" }),
      makeCall({ id: "ok", route: "qualified", bookingUid: "x" }),
      makeCall({ id: "cb", route: "callback" }),
      makeCall({ id: "unbooked", route: "qualified" }),
      makeCall({ id: "angry", route: "escalate" }),
      makeCall({ id: "no", route: "close", closeReason: "budget_misaligned" }),
    ]);
    expect(list.map((c) => c.id)).toEqual(["angry", "cb", "drop", "unbooked"]);
  });
});

describe("rangeStart", () => {
  const now = t("2026-10-10T12:00:00Z");
  it.each([
    ["7d", "2026-10-03T12:00:00.000Z"],
    ["30d", "2026-09-10T12:00:00.000Z"],
  ] as const)("%s starts that many days back", (key, iso) => {
    expect(rangeStart(key, now)?.toISOString()).toBe(iso);
  });
  it("all has no start", () => expect(rangeStart("all", now)).toBeNull());
  it("unknown values fall back to 30 days", () => {
    expect(rangeStart("junk" as RangeKey, now)?.toISOString()).toBe("2026-09-10T12:00:00.000Z");
  });
});

describe("inView", () => {
  const all = [
    makeCall({ id: "booked", route: "qualified", bookingUid: "x" }),
    makeCall({ id: "unbooked", route: "qualified_flagged" }),
    makeCall({ id: "closed", route: "close", closeReason: "timeline_unworkable" }),
    makeCall({ id: "angry", route: "escalate" }),
    makeCall({ id: "live", route: null }),
  ];
  const ids = (v: Parameters<typeof inView>[1]) => all.filter((c) => inView(c, v)).map((c) => c.id);

  it("splits calls into booked, needs a person, and closed", () => {
    expect(ids("all")).toEqual(["booked", "unbooked", "closed", "angry", "live"]);
    expect(ids("booked")).toEqual(["booked"]);
    expect(ids("follow_up")).toEqual(["unbooked", "angry"]);
    expect(ids("closed")).toEqual(["closed"]);
  });

  it("parses unknown views as all", () => {
    expect(parseView("nope")).toBe("all");
    expect(parseView("booked")).toBe("booked");
  });
});
