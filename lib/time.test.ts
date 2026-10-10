import { describe, expect, it } from "vitest";
import { isAfterHours, answeredWithin } from "./time";

describe("isAfterHours (studio front desk is 10am to 7pm IST)", () => {
  it.each([
    ["2026-09-09T17:17:00Z", true], // 10:47pm IST (T08)
    ["2026-09-08T04:14:00Z", true], // 9:44am IST (T07)
    ["2026-09-25T03:45:00Z", true], // 9:15am IST (T20)
    ["2026-09-02T04:53:00Z", false], // 10:23am IST (T01)
    ["2026-09-24T10:32:00Z", false], // 4:02pm IST
    ["2026-09-24T13:29:00Z", false], // 6:59pm IST
    ["2026-09-24T13:30:00Z", true], // 7:00pm IST
  ])("%s -> %s", (iso, expected) => {
    expect(isAfterHours(new Date(iso))).toBe(expected);
  });
});

describe("answeredWithin", () => {
  it("is true when answered inside the window", () => {
    expect(answeredWithin(new Date("2026-10-01T10:00:00Z"), new Date("2026-10-01T10:00:04Z"), 300)).toBe(true);
  });
  it("is false when never answered", () => {
    expect(answeredWithin(new Date("2026-10-01T10:00:00Z"), null, 300)).toBe(false);
  });
  it("is false when answered after the window", () => {
    expect(answeredWithin(new Date("2026-10-01T10:00:00Z"), new Date("2026-10-01T10:06:00Z"), 300)).toBe(false);
  });
});
