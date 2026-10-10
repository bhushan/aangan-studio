import { describe, expect, it } from "vitest";
import { tokenCostUsd } from "./qualify";

describe("tokenCostUsd (Gemini 3.8 Flash: $0.75 in, $3.75 out per million)", () => {
  it("prices input and output tokens, including reasoning in output", () => {
    expect(tokenCostUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(4.5);
    expect(tokenCostUsd({ inputTokens: 2000, outputTokens: 300 })).toBeCloseTo(0.002625);
  });
  it("is null when usage is unknown", () => {
    expect(tokenCostUsd({ inputTokens: undefined, outputTokens: undefined })).toBeNull();
  });
});
