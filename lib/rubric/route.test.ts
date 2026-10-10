import { describe, expect, it } from "vitest";
import { decideRoute } from "./route";
import type { Assessment, CriterionKey, Verdict } from "./schema";

function assess(
  verdicts: Partial<Record<CriterionKey, Verdict>>,
  extra: Partial<Assessment> = {},
): Assessment {
  const keys: CriterionKey[] = ["real_project", "service_area", "timeline", "budget", "decision_maker"];
  return {
    criteria: Object.fromEntries(
      keys.map((k) => [k, { verdict: verdicts[k] ?? "pass", evidence: "" }]),
    ) as Assessment["criteria"],
    is_complaint: false,
    suggested_question: null,
    ...extra,
  };
}

describe("decideRoute", () => {
  it("qualifies when all five pass", () => {
    expect(decideRoute(assess({}), { askCount: 0 })).toEqual({
      route: "qualified",
      flags: [],
      closeReason: null,
      askAbout: null,
    });
  });

  it("escalates complaints before judging the criteria", () => {
    const d = decideRoute(assess({ service_area: "fail" }, { is_complaint: true }), { askCount: 0 });
    expect(d.route).toBe("escalate");
  });

  it.each([
    ["real_project", "not_a_real_project"],
    ["service_area", "outside_service_area"],
    ["timeline", "timeline_unworkable"],
    ["budget", "budget_misaligned"],
    ["decision_maker", "no_decision_maker"],
  ] as const)("closes when %s fails", (key, reason) => {
    const d = decideRoute(assess({ [key]: "fail" }), { askCount: 0 });
    expect(d).toMatchObject({ route: "close", closeReason: reason });
  });

  it("uses the first failing criterion as the close reason when several fail", () => {
    const d = decideRoute(assess({ timeline: "fail", service_area: "fail" }), { askCount: 0 });
    expect(d.closeReason).toBe("outside_service_area");
  });

  it("a fail beats an unclear", () => {
    const d = decideRoute(assess({ real_project: "unclear", budget: "fail" }), { askCount: 0 });
    expect(d.route).toBe("close");
  });

  it.each(["real_project", "service_area", "timeline"] as const)(
    "asks one question when %s is unclear",
    (key) => {
      const d = decideRoute(assess({ [key]: "unclear" }), { askCount: 0 });
      expect(d).toMatchObject({ route: "ask", askAbout: key });
    },
  );

  it("does not ask a second question; hands to a senior callback instead", () => {
    const d = decideRoute(assess({ timeline: "unclear" }), { askCount: 1 });
    expect(d.route).toBe("callback");
  });

  it("qualifies with flags when only budget or decision-maker is unclear", () => {
    const d = decideRoute(assess({ budget: "unclear", decision_maker: "unclear" }), { askCount: 0 });
    expect(d).toMatchObject({ route: "qualified_flagged", flags: ["budget", "decision_maker"] });
  });

  it("asks about 1-3 before flagging 4-5", () => {
    const d = decideRoute(assess({ service_area: "unclear", decision_maker: "unclear" }), { askCount: 0 });
    expect(d).toMatchObject({ route: "ask", askAbout: "service_area" });
  });
});
