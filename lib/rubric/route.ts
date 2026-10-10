import { CLOSE_REASONS, type CloseReason, type Route } from "../calls/types";
import { CRITERIA, type Assessment, type CriterionKey } from "./schema";

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
