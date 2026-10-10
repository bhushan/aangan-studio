import { describe, expect, it } from "vitest";
import {
  bodyShape,
  isAuthorized,
  parseBookRequest,
  parseQualifyRequest,
  parseVaaniEvent,
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

  it("treats filler the agent writes into required fields as not said", () => {
    const r = parseQualifyRequest({
      call_id: "made-up-id",
      name: "Neelam",
      locality: "Karve Nagar",
      budget_volunteered: "Not mentioned",
      decision_maker: "unknown",
      notes: "N/A",
      size_sqft: 0,
      completion: "not specified",
      scope: "-",
    });
    expect(r.answers).toEqual({ name: "Neelam", locality: "Karve Nagar" });
  });

  it("reads tool arguments sent as a JSON string (OpenAI-style function calls)", () => {
    const r = parseQualifyRequest({ arguments: JSON.stringify({ name: "Puja", locality: "Nashik", completion: "in fifteen days" }) });
    expect(r.answers).toEqual({ name: "Puja", locality: "Nashik", completion: "in fifteen days" });
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

  it("returns a null call id when Vaani does not send one", () => {
    expect(parseQualifyRequest({ answers: {} }).vaaniCallId).toBeNull();
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

describe("parseVaaniEvent (Vaani account webhook)", () => {
  it("reads an inbound call_started", () => {
    expect(parseVaaniEvent({ event: "call_started", room_name: "room_1", phone_number: "+910000000001" })).toMatchObject({
      event: "call_started",
      vaaniCallId: "room_1",
      callerNumber: "+910000000001",
    });
  });

  it("reads call_ended duration in seconds", () => {
    expect(parseVaaniEvent({ event: "call_ended", room_name: "room_1", call_duration: 42.5 })).toMatchObject({
      event: "call_ended",
      durationSec: 43,
      voiceMinutes: 1,
    });
  });

  it("reads call_postprocessing: nested data, duration in ms, timestamped transcript", () => {
    const r = parseVaaniEvent({
      event: "call_postprocessing",
      call_id: "room_1",
      data: {
        room_name: "room_1",
        call_duration: 125150.02,
        summary: "Wants a 3BHK redesign",
        transcript: "[13:33:14] AGENT: Aangan Studio, how can I help?\n\n[13:33:19] USER: I want to redo my flat.",
      },
    });
    expect(r).toMatchObject({ event: "call_postprocessing", vaaniCallId: "room_1", durationSec: 125, voiceMinutes: 3 });
    expect(r.transcript).toBe("[13:33:14] Agent: Aangan Studio, how can I help?\n[13:33:19] Caller: I want to redo my flat.");
  });

  it("reads call_postprocessing duration in seconds when Vaani sends seconds (seen on a live call)", () => {
    const r = parseVaaniEvent({ event: "call_postprocessing", call_id: "room_1", data: { room_name: "room_1", call_duration: 112.4 } });
    expect(r).toMatchObject({ durationSec: 112, voiceMinutes: 2 });
  });

  it("ignores a caller id that is not a phone number (browser test calls send web-user)", () => {
    expect(parseVaaniEvent({ event: "call_started", room_name: "room_1", phone_number: "web-user" }).callerNumber).toBeNull();
    expect(parseVaaniEvent({ event: "call_started", room_name: "room_1", phone_number: "+91 98765 43210" }).callerNumber).toBe("+919876543210");
  });

  it("throws without an event name", () => {
    expect(() => parseVaaniEvent({ room_name: "room_1" })).toThrow(/event/i);
  });
});

describe("tool requests without a call id", () => {
  it("qualify reads flat arguments and leaves the call id empty", () => {
    const r = parseQualifyRequest({ name: "Priya", locality: "Kothrud" });
    expect(r.vaaniCallId).toBeNull();
    expect(r.answers).toMatchObject({ name: "Priya", locality: "Kothrud" });
  });

  it("accepts the URL secret even when Vaani sends its own Authorization header", () => {
    const h = new Headers({ authorization: "Bearer some-vaani-signature" });
    expect(isAuthorized(h, "s3cret", new URL("https://x.test/api/vaani/webhook?secret=s3cret"))).toBe(true);
  });

  it("accepts the dashboard Secret field sent in common webhook secret headers", () => {
    for (const name of ["x-webhook-secret", "x-vaani-secret", "x-secret", "x-api-key"]) {
      expect(isAuthorized(new Headers({ [name]: "s3cret" }), "s3cret")).toBe(true);
    }
  });

  it("accepts the secret as a query parameter for the dashboard webhook URL", () => {
    expect(isAuthorized(new Headers(), "s3cret", new URL("https://x.test/api/vaani/webhook?secret=s3cret"))).toBe(true);
    expect(isAuthorized(new Headers(), "s3cret", new URL("https://x.test/api/vaani/webhook?secret=nope"))).toBe(false);
  });
});

describe("hardening against Vaani's tool templates", () => {
  it("treats blank template fields as missing, so they never overwrite earlier answers", () => {
    const r = parseQualifyRequest({ name: "", locality: "  ", completion: "March", size_sqft: 0 });
    expect(r.answers).toEqual({ completion: "March" });
  });

  it("ignores an unfilled call id placeholder", () => {
    expect(parseQualifyRequest({ call_id: "{room_name}", answers: {} }).vaaniCallId).toBeNull();
    expect(parseQualifyRequest({ call_id: "{{call_id}}", answers: {} }).vaaniCallId).toBeNull();
  });

  it("ignores an invalid started_at instead of failing the call", () => {
    expect(parseQualifyRequest({ call_id: "v_1", started_at: "yesterday-ish" }).startedAt).toBeNull();
  });

  it("reads a slot time without an offset as IST, not UTC", () => {
    expect(parseBookRequest({ slot_start: "2026-10-12T11:00:00" }).slotStart).toBe("2026-10-12T05:30:00.000Z");
    expect(parseBookRequest({ slot_start: "2026-10-12T05:30:00.000Z" }).slotStart).toBe("2026-10-12T05:30:00.000Z");
  });
});

describe("bodyShape", () => {
  it("describes the structure Vaani sent without any values", () => {
    const shape = bodyShape({ call_id: "room-1", name: "Neelam", size_sqft: 1500, args: { locality: "Karve Nagar", empty: "" }, list: [1, 2] });
    expect(shape).toBe("{call_id:string(6), name:string(6), size_sqft:number, args:{locality:string(11), empty:string(0)}, list:array(2)}");
    expect(shape).not.toContain("Neelam");
  });
});
