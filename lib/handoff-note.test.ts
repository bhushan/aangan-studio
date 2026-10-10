import { describe, expect, it } from "vitest";
import { buildHandoffNote } from "./handoff-note";
import { makeCall } from "./calls/fixtures";

const opts = { dashboardUrl: "https://example.test", priorCalls: [] };

describe("buildHandoffNote", () => {
  it("carries everything the designer would otherwise re-ask", () => {
    const note = buildHandoffNote(
      makeCall({ route: "qualified", bookingAt: new Date("2026-10-03T05:30:00Z") }),
      opts,
    );
    for (const s of ["Priya", "+910000000001", "Kothrud", "Full 3BHK redesign", "1400 sq ft", "March 2027", "Owner, spouse agrees"]) {
      expect(note).toContain(s);
    }
    expect(note).toContain("Sat 3 Oct, 11:00 am"); // IST
    expect(note).toContain("https://example.test/calls/c_1");
    expect(note).toContain("after hours");
  });

  it("flags unclear budget or decision-maker", () => {
    const note = buildHandoffNote(
      makeCall({ route: "qualified_flagged", flags: ["decision_maker"] }),
      opts,
    );
    expect(note).toMatch(/Flag: decision-maker unclear/);
  });

  it("marks complaints urgent", () => {
    const note = buildHandoffNote(makeCall({ route: "escalate" }), opts);
    expect(note.split("\n")[0]).toMatch(/URGENT/);
  });

  it("asks for a call back on dropped calls", () => {
    const note = buildHandoffNote(makeCall({ route: "dropped" }), opts);
    expect(note.split("\n")[0]).toMatch(/call back/i);
  });

  it("mentions repeat callers", () => {
    const note = buildHandoffNote(makeCall({ route: "qualified" }), {
      ...opts,
      priorCalls: [makeCall({ id: "c_0", startedAt: new Date("2026-09-28T09:00:00Z"), route: "callback" })],
    });
    expect(note).toContain("Called before: 1 time");
  });
});
