import { isQualified, type CallRecord, type CloseReason, type Route } from "./calls/types";
import { answeredWithin } from "./time";

/** Before the voice agent: 48% of enquiries got no reply within 48 hours (Sept 2026 audit). */
export const BASELINE_UNANSWERED_48H = 0.48;
/** Typical Aangan project value, used to put a range on booked consultations. */
export const PROJECT_VALUE_INR = { low: 800_000, high: 1_400_000 };
/** Vaani self-serve rate, and a fixed conversion for Gemini's dollar pricing. Both overridable by env. */
export const DEFAULT_RATES = { inrPerVoiceMinute: 5.5, inrPerUsd: 88 };

export type Rates = typeof DEFAULT_RATES;
export type Outcome = Route | "in_progress";

export type Metrics = {
  total: number;
  afterHours: number;
  answeredIn5Min: number;
  answeredIn5MinRate: number | null;
  qualified: number;
  qualifiedRate: number | null;
  booked: number;
  outcomes: Partial<Record<Outcome, number>>;
  closeReasons: { reason: CloseReason; count: number }[];
  cost: {
    voiceMinutes: number;
    voiceInr: number;
    aiInr: number;
    totalInr: number;
    perCallInr: number | null;
    perBookingInr: number | null;
  };
  pipelineInr: { low: number; high: number };
};

const rate = (n: number, of: number) => (of ? n / of : null);

export function computeMetrics(calls: CallRecord[], rates: Rates): Metrics {
  const total = calls.length;
  const qualified = calls.filter((c) => isQualified(c.route)).length;
  const booked = calls.filter((c) => c.bookingUid).length;
  const answeredIn5Min = calls.filter((c) => answeredWithin(c.startedAt, c.answeredAt, 300)).length;

  const outcomes: Partial<Record<Outcome, number>> = {};
  const reasons = new Map<CloseReason, number>();
  let voiceMinutes = 0;
  let aiUsd = 0;
  for (const c of calls) {
    const o = c.route ?? "in_progress";
    outcomes[o] = (outcomes[o] ?? 0) + 1;
    if (c.closeReason) reasons.set(c.closeReason, (reasons.get(c.closeReason) ?? 0) + 1);
    voiceMinutes += c.voiceMinutes ?? 0;
    aiUsd += c.aiCostUsd ?? 0;
  }

  const voiceInr = voiceMinutes * rates.inrPerVoiceMinute;
  const aiInr = aiUsd * rates.inrPerUsd;
  const totalInr = voiceInr + aiInr;

  return {
    total,
    afterHours: calls.filter((c) => c.afterHours).length,
    answeredIn5Min,
    answeredIn5MinRate: rate(answeredIn5Min, total),
    qualified,
    qualifiedRate: rate(qualified, total),
    booked,
    outcomes,
    closeReasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    cost: { voiceMinutes, voiceInr, aiInr, totalInr, perCallInr: rate(totalInr, total), perBookingInr: rate(totalInr, booked) },
    pipelineInr: { low: booked * PROJECT_VALUE_INR.low, high: booked * PROJECT_VALUE_INR.high },
  };
}

const FOLLOW_UP_ORDER: Partial<Record<Route, number>> = { escalate: 0, callback: 1, dropped: 2, qualified: 3, qualified_flagged: 3 };

/** Calls a person should pick up: complaints, callbacks, dropped calls, and qualified callers who did not book. */
export function followUps(calls: CallRecord[]): CallRecord[] {
  return calls
    .filter((c) => inView(c, "follow_up"))
    .sort((a, b) => FOLLOW_UP_ORDER[a.route!]! - FOLLOW_UP_ORDER[b.route!]! || b.startedAt.getTime() - a.startedAt.getTime());
}

export const RANGES = { "7d": "Last 7 days", "30d": "Last 30 days", all: "All time" } as const;
export type RangeKey = keyof typeof RANGES;

export function parseRange(v: string | string[] | undefined): RangeKey {
  return typeof v === "string" && v in RANGES ? (v as RangeKey) : "30d";
}

export function rangeStart(key: RangeKey, now: Date): Date | null {
  if (key === "all") return null;
  const days = key === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 86400_000);
}

export const VIEWS = { all: "All calls", booked: "Booked", follow_up: "Needs a person", closed: "Not a fit" } as const;
export type ViewKey = keyof typeof VIEWS;

export function parseView(v: string | string[] | undefined): ViewKey {
  return typeof v === "string" && v in VIEWS ? (v as ViewKey) : "all";
}

export function inView(c: CallRecord, view: ViewKey): boolean {
  switch (view) {
    case "all":
      return true;
    case "booked":
      return c.bookingUid !== null;
    case "follow_up":
      return c.route !== null && FOLLOW_UP_ORDER[c.route] !== undefined && !(isQualified(c.route) && c.bookingUid);
    case "closed":
      return c.route === "close";
  }
}
