import { describe, expect, it } from "vitest";
import { formatDuration, formatInr, formatInrRange, formatPercent } from "./format";

describe("formatInr", () => {
  it.each([
    [0, "₹0"],
    [0.35, "₹0.35"],
    [55.352, "₹55"],
    [12_345, "₹12,345"],
    [800_000, "₹8L"],
    [1_250_000, "₹12.5L"],
    [14_000_000, "₹1.4Cr"],
  ])("%d -> %s", (n, s) => expect(formatInr(n)).toBe(s));
});

describe("formatPercent", () => {
  it("rounds, and shows a dash when there is nothing to divide", () => {
    expect(formatPercent(5 / 6)).toBe("83%");
    expect(formatPercent(null)).toBe("–");
  });
});

describe("formatDuration", () => {
  it.each([
    [null, "–"],
    [45, "45s"],
    [112, "1m 52s"],
    [600, "10m"],
  ])("%s -> %s", (s, out) => expect(formatDuration(s)).toBe(out));
});

describe("formatInrRange", () => {
  it("drops the second rupee sign", () => expect(formatInrRange({ low: 800_000, high: 1_400_000 })).toBe("₹8L–14L"));
});
