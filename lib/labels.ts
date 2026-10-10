import type { CloseReason } from "./calls/types";
import type { Outcome } from "./metrics";
import type { CriterionKey, Verdict } from "./rubric/schema";

export type Tone = "good" | "warn" | "bad" | "muted" | "live";

/** What each outcome means to a designer, and the colour it carries. */
export const OUTCOME: Record<Outcome, { label: string; tone: Tone }> = {
  qualified: { label: "Qualified", tone: "good" },
  qualified_flagged: { label: "Qualified, check notes", tone: "good" },
  ask: { label: "Still qualifying", tone: "live" },
  in_progress: { label: "In progress", tone: "live" },
  close: { label: "Not a fit", tone: "muted" },
  escalate: { label: "Complaint", tone: "bad" },
  callback: { label: "Senior callback", tone: "warn" },
  dropped: { label: "No decision reached", tone: "warn" },
};

export const CLOSE_REASON: Record<CloseReason, string> = {
  outside_service_area: "Outside Pune and PCMC",
  not_a_real_project: "Not a project we take",
  timeline_unworkable: "Timeline too tight",
  budget_misaligned: "Budget too low for the scope",
  no_decision_maker: "Not the decision-maker",
};

export const CRITERION: Record<CriterionKey, string> = {
  real_project: "Project we take on",
  service_area: "In our service area",
  timeline: "Workable timeline",
  budget: "Budget fits the scope",
  decision_maker: "Speaking to the decider",
};

export const VERDICT: Record<Verdict, { label: string; tone: Tone }> = {
  pass: { label: "Yes", tone: "good" },
  fail: { label: "No", tone: "bad" },
  unclear: { label: "Unclear", tone: "warn" },
};

/** The one thing a person should do next with this call, if anything. */
export const NEXT_STEP: Partial<Record<Outcome, string>> = {
  escalate: "Existing client complaint. A senior person was promised to call back within 15 minutes.",
  callback: "The agent couldn't settle the details. A senior person should call back.",
  dropped: "The call ended before the agent reached a decision. Call back to complete the enquiry.",
  qualified: "Qualified but no consultation booked. Call back to fix a time.",
  qualified_flagged: "Qualified but no consultation booked. Call back to fix a time.",
};
