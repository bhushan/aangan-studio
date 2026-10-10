import { describe, expect, it } from "vitest";
import {
  isAuthorized,
  parseBookRequest,
  parseCallEnded,
  parseQualifyRequest,
} from "./adapter";

describe("isAuthorized", () => {
  it("accepts the shared secret in our header or as a bearer token", () => {
    expect(isAuthorized(new Headers({ "x-aangan-secret": "s3cret" }), "s3cret")).toBe(true);
    expect(isAuthorized(new Headers({ authorization: "Bearer s3cret" }), "s3cret")).toBe(true);
  });
  it("rejects a wrong or missing secret, and an unset server secret", () => {
    expect(isAuthorized(new Headers({ "x-aangan-secret": "nope" }), "s3cret")).toBe(false);
    expect(isAuthorized(new Headers(), "s3cret")).toBe(false);
    expect(isAuthorized(new Headers({ "x-aangan-secret": "" }), "")).toBe(false);
  });
});

describe("parseQualifyRequest", () => {
  it("reads our own contract", () => {
    const r = parseQualifyRequest({
      call_id: "v_1",
      caller_number: "+910000000001",
      answers: { name: "Priya", locality: "Kothrud", size_sqft: "1,400" },
    });
    expect(r).toMatchObject({
      vaaniCallId: "v_1",
      callerNumber: "+910000000001",
      answers: { name: "Priya", locality: "Kothrud", size_sqft: 1400 },
    });
  });

  it("reads a nested call object with tool arguments", () => {
    const r = parseQualifyRequest({
      call: { id: "v_2", from: "+910000000002" },
      arguments: { scope: "office fitout" },
    });
    expect(r).toMatchObject({ vaaniCallId: "v_2", callerNumber: "+910000000002", answers: { scope: "office fitout" } });
  });

  it("accepts arguments sent as a JSON string", () => {
    const r = parseQualifyRequest({ callId: "v_3", args: JSON.stringify({ locality: "Baner" }) });
    expect(r.answers.locality).toBe("Baner");
  });

  it("throws without a call id", () => {
    expect(() => parseQualifyRequest({ answers: {} })).toThrow(/call id/i);
  });
});

describe("parseBookRequest", () => {
  it("needs a slot start", () => {
    expect(parseBookRequest({ call_id: "v_1", slot_start: "2026-10-03T05:30:00Z" })).toMatchObject({
      vaaniCallId: "v_1",
      slotStart: "2026-10-03T05:30:00.000Z",
    });
    expect(() => parseBookRequest({ call_id: "v_1" })).toThrow();
  });
});

describe("parseCallEnded", () => {
  it("flattens a turn-by-turn transcript", () => {
    const r = parseCallEnded({
      call_id: "v_1",
      started_at: "2026-10-01T17:00:00Z",
      ended_at: "2026-10-01T17:04:00Z",
      transcript: [
        { role: "agent", text: "Aangan Studio, how can I help?" },
        { role: "user", content: "I want to redo my flat." },
      ],
    });
    expect(r.transcript).toBe("Agent: Aangan Studio, how can I help?\nCaller: I want to redo my flat.");
    expect(r.durationSec).toBe(240);
    expect(r.voiceMinutes).toBe(4);
  });

  it("keeps a plain-text transcript and explicit duration", () => {
    const r = parseCallEnded({ call_id: "v_1", transcript: "hello", duration_sec: 61 });
    expect(r).toMatchObject({ transcript: "hello", durationSec: 61, voiceMinutes: 2 });
  });
});
