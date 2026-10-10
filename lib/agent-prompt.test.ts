import { describe, expect, it } from "vitest";
import { buildAgentPrompt, loadStudioFiles, TOOL_NAMES } from "./agent-prompt";

describe("buildAgentPrompt", () => {
  const prompt = buildAgentPrompt(loadStudioFiles());

  it("never contains a price figure (the Cut)", () => {
    expect(prompt).not.toMatch(/₹/);
    expect(prompt).not.toMatch(/\blakhs?\b/i); // word match: "Pimple Nilakh" is a locality
    expect(prompt).not.toMatch(/\d[\d,]*\s*(–|-|to)\s*[\d,]+\s*per\s*sq/i);
    expect(prompt).not.toMatch(/per sq ?ft/i);
  });

  it("contains the approved pricing deflection line", () => {
    expect(prompt).toContain("your designer will walk you through it in detail at the consultation");
  });

  it("carries the never-say list", () => {
    expect(prompt).toContain("Our rates start at");
  });

  it("includes what the studio does and does not do", () => {
    expect(prompt).toContain("What we don't do");
    expect(prompt).toContain("PCMC");
  });

  it("asks the decider question once, gently, before qualifying", () => {
    expect(prompt).toContain("Will anyone else be part of the decision?");
    expect(prompt).toMatch(/Ask it once[\s\S]*whatever they answer/);
    expect(prompt.indexOf("part of the decision")).toBeLessThan(prompt.indexOf(`Call ${TOOL_NAMES.qualify} with everything`));
  });

  it("reads the key details back for the caller to confirm before the first check", () => {
    expect(prompt).toMatch(/read back/i);
    expect(prompt).toContain("is that right?");
    expect(prompt.indexOf("is that right?")).toBeLessThan(prompt.indexOf(`Call ${TOOL_NAMES.qualify} with everything`));
  });

  it("never confirms a booking the server did not confirm", () => {
    expect(prompt).toContain("Only tell the caller they are booked when it returns booked: true.");
  });

  it("names the tools exactly as Vaani registered them", () => {
    for (const name of ["submit_property_qualification", "create_vaani_slot", "book_vaani_slot"]) expect(prompt).toContain(name);
  });
});
