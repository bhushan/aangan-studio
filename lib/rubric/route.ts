import { CLOSE_REASONS, type CloseReason, type Route } from "../calls/types";
import { CRITERIA, type Answers, type Assessment, type CriterionKey } from "./schema";

export type Decision = {
  route: Route;
  flags: CriterionKey[];
  closeReason: CloseReason | null;
  askAbout: CriterionKey | null;
};

// Criteria the agent may ask one question each about. Unclear budget or decision-maker is never pushed.
const ASKABLE: CriterionKey[] = ["real_project", "service_area", "timeline"];

/** Applies the routing rules from qualified.md. The model judges; this decides. */
export function decideRoute(a: Assessment, ctx: { askedAbout: CriterionKey[] }): Decision {
  const none: Decision = { route: "qualified", flags: [], closeReason: null, askAbout: null };
  if (a.is_complaint) return { ...none, route: "escalate" };

  const failed = CRITERIA.find((k) => a.criteria[k].verdict === "fail");
  if (failed) return { ...none, route: "close", closeReason: CLOSE_REASONS[failed] };

  const unclear = CRITERIA.filter((k) => a.criteria[k].verdict === "unclear");
  const unclearAskable = unclear.filter((k) => ASKABLE.includes(k));
  if (unclearAskable.length) {
    // qualified.md: unclear on 1, 2 or 3 -> ask one direct question (each, never the same twice).
    const askAbout = unclearAskable.find((k) => !ctx.askedAbout.includes(k));
    return askAbout ? { ...none, route: "ask", askAbout } : { ...none, route: "callback" };
  }
  if (unclear.length) return { ...none, route: "qualified_flagged", flags: unclear };
  return none;
}

// The three details every enquiry needs before it is judged, in the order the agent collects them.
const CORE: { field: "locality" | "scope" | "completion"; criterion: CriterionKey }[] = [
  { field: "locality", criterion: "service_area" },
  { field: "scope", criterion: "real_project" },
  { field: "completion", criterion: "timeline" },
];

/**
 * The next core detail to ask for, or null when the call can be judged. Each is asked for once:
 * if the agent still does not pass it, the call is judged on what there is rather than looping.
 */
export function nextToCollect(answers: Answers, requested: CriterionKey[]): { field: string; criterion: CriterionKey } | null {
  return CORE.find((c) => !answers[c.field] && !requested.includes(c.criterion)) ?? null;
}
