import { describe, expect, it } from "vitest";
import { DEFAULT_QUALIFY_MODEL, tokenCostUsd } from "./qualify";

describe("tokenCostUsd", () => {
  it("defaults to Flash-Lite, the model fast enough for Vaani's tool budget", () => {
    expect(DEFAULT_QUALIFY_MODEL).toBe("gemini-3.5-flash-lite");
  });
  it("prices Flash-Lite at $0.30 in / $2.50 out per million", () => {
    expect(tokenCostUsd("gemini-3.5-flash-lite", { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(2.8);
  });
  it("prices Flash at $0.75 in / $3.75 out per million", () => {
    expect(tokenCostUsd("gemini-3.8-flash", { inputTokens: 2000, outputTokens: 300 })).toBeCloseTo(0.002625);
  });
  it("is null when usage or the model's price is unknown", () => {
    expect(tokenCostUsd("gemini-3.5-flash-lite", { inputTokens: undefined, outputTokens: undefined })).toBeNull();
    expect(tokenCostUsd("some-new-model", { inputTokens: 10, outputTokens: 10 })).toBeNull();
  });
});
