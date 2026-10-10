import { describe, expect, it } from "vitest";
import { parseTranscript } from "./transcript";

describe("parseTranscript", () => {
  it("splits stored lines into turns, timed from the start of the call", () => {
    const t = "[13:33:14] Agent: Namaste, Aangan Studio.\n[13:33:19] Caller: Hi, I have a 3BHK in Baner.\n[13:34:30] Agent: Lovely.";
    expect(parseTranscript(t)).toEqual([
      { who: "agent", at: "0:00", text: "Namaste, Aangan Studio." },
      { who: "caller", at: "0:05", text: "Hi, I have a 3BHK in Baner." },
      { who: "agent", at: "1:16", text: "Lovely." },
    ]);
  });

  it("joins fragments the same speaker said in a row into one turn", () => {
    const t = "[15:13:48] Agent: Hello.\n[15:13:53] Caller: I was trying to\n[15:13:55] Caller: get my\n[15:13:57] Caller: home done.";
    expect(parseTranscript(t)).toEqual([
      { who: "agent", at: "0:00", text: "Hello." },
      { who: "caller", at: "0:05", text: "I was trying to get my home done." },
    ]);
  });

  it("keeps turns without timestamps, and folds unlabelled lines into the previous turn", () => {
    expect(parseTranscript("Agent: Hi\nCaller: first line\nsecond line")).toEqual([
      { who: "agent", at: null, text: "Hi" },
      { who: "caller", at: null, text: "first line second line" },
    ]);
  });

  it("returns nothing for an empty transcript", () => {
    expect(parseTranscript(null)).toEqual([]);
    expect(parseTranscript("  ")).toEqual([]);
  });
});
