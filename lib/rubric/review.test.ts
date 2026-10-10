import { describe, expect, it } from "vitest";
import { fillMissing, reviewNote } from "./review";

describe("fillMissing", () => {
  it("keeps what the agent captured and fills only the gaps from the transcript", () => {
    const r = fillMissing({ name: "Puja", locality: null }, { name: "Pooja", locality: "Nashik", completion: "in fifteen days", scope: null });
    expect(r.answers).toEqual({ name: "Puja", locality: "Nashik", completion: "in fifteen days" });
    expect(r.filled).toEqual(["locality", "completion"]);
  });
});

describe("reviewNote", () => {
  const close = { route: "close", closeReason: "outside_service_area" } as const;
  const qualified = { route: "qualified", closeReason: null } as const;

  it("is silent when the review agrees with the call or cannot decide", () => {
    expect(reviewNote("close", close)).toBeNull();
    expect(reviewNote("qualified_flagged", qualified)).toBeNull();
    expect(reviewNote("qualified", { route: "callback", closeReason: null })).toBeNull();
  });

  it("warns before a consultation the transcript says is not a fit", () => {
    expect(reviewNote("qualified", close)).toMatch(/may not be a fit.*Pune and PCMC.*before the consultation/i);
  });

  it("tells the team a callback may not be needed, or should book", () => {
    expect(reviewNote("callback", close)).toMatch(/likely not a fit.*callback may not be needed/i);
    expect(reviewNote("dropped", qualified)).toMatch(/looks qualified.*book/i);
  });

  it("flags a caller turned away who looks like a fit", () => {
    expect(reviewNote("close", qualified)).toMatch(/fit after all/i);
  });

  it("raises a complaint the call missed, and never downplays one it caught", () => {
    expect(reviewNote("qualified", { route: "escalate", closeReason: null })).toMatch(/complaint/i);
    expect(reviewNote("escalate", qualified)).toBeNull();
  });
});
