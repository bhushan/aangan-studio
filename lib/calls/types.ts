import type { Answers, Assessment, CriterionKey } from "../rubric/schema";

export const ROUTES = ["qualified", "qualified_flagged", "ask", "close", "escalate", "callback", "dropped"] as const;
export type Route = (typeof ROUTES)[number];

export const CLOSE_REASONS = {
  real_project: "not_a_real_project",
  service_area: "outside_service_area",
  timeline: "timeline_unworkable",
  budget: "budget_misaligned",
  decision_maker: "no_decision_maker",
} as const satisfies Record<CriterionKey, string>;
export type CloseReason = (typeof CLOSE_REASONS)[CriterionKey];

/** Post-call re-read of the full transcript. Never changes `route`, which is what the caller was told. */
export type CallReview = {
  assessment: Assessment;
  route: Route;
  closeReason: CloseReason | null;
  /** Set only when the review contradicts the mid-call outcome. */
  note: string | null;
  /** Answer fields the transcript filled because the agent never passed them. */
  filled: string[];
  at: string;
};

export type CallRecord = {
  id: string;
  vaaniCallId: string;
  callerNumber: string | null;
  startedAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
  afterHours: boolean;
  answers: Answers;
  assessment: Assessment | null;
  route: Route | null;
  closeReason: CloseReason | null;
  flags: CriterionKey[];
  /** Criteria the agent has already asked a follow-up question about. */
  askedAbout: CriterionKey[];
  /** Core details the server asked the agent to collect before judging (each once). */
  requested: CriterionKey[];
  review: CallReview | null;
  bookingUid: string | null;
  bookingAt: Date | null;
  hubspotContactId: string | null;
  hubspotCallId: string | null;
  hubspotDealId: string | null;
  hubspotTaskId: string | null;
  telegramSentAt: Date | null;
  transcript: string | null;
  durationSec: number | null;
  voiceMinutes: number | null;
  aiCostUsd: number | null;
  aiLatencyMs: number | null;
};

export const isQualified = (route: Route | null) => route === "qualified" || route === "qualified_flagged";
