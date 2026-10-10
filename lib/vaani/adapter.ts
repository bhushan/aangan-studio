import { timingSafeEqual } from "node:crypto";
import { answersSchema, type Answers } from "../rubric/schema";

// Everything Vaani-shaped is normalised here, so the rest of the app only sees our own contract.
// Webhook events follow https://docs.vaanivoice.ai/guides/webhook-setup. Custom tools are cURL
// templates whose body shape Vaani's LLM fills in, so tool parsing is deliberately lenient.

type Body = Record<string, unknown>;

const obj = (v: unknown): Body => {
  if (typeof v === "string") {
    try {
      return obj(JSON.parse(v));
    } catch {
      return {};
    }
  }
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Body) : {};
};
const str = (...vs: unknown[]) => vs.find((v): v is string => typeof v === "string" && v.trim().length > 0)?.trim() ?? null;
const date = (v: unknown) => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
// A cURL template field Vaani did not fill in, e.g. "{room_name}" or "{{call_id}}".
const unfilled = (v: string | null) => (v && /[{}]/.test(v) ? null : v);

/** Shared secret via header, bearer token, or `?secret=` (the Vaani dashboard webhook takes only a URL). */
export function isAuthorized(headers: Headers, secret: string | undefined, url?: URL): boolean {
  if (!secret) return false;
  // Any one matching source is enough: Vaani may send its own Authorization header alongside our URL secret.
  const candidates = [
    ...SECRET_HEADERS.map((h) => headers.get(h)),
    headers.get("authorization")?.replace(/^Bearer\s+/i, ""),
    url?.searchParams.get("secret"),
  ];
  const b = Buffer.from(secret);
  return candidates.some((given) => {
    if (!given) return false;
    const a = Buffer.from(given);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

// Our tool header, plus names a dashboard "Secret" field commonly uses.
const SECRET_HEADERS = ["x-aangan-secret", "x-webhook-secret", "x-vaani-secret", "x-secret", "x-api-key"];

function callMeta(raw: unknown) {
  const b = obj(raw);
  const call = obj(b.call);
  const vaaniCallId = unfilled(str(b.call_id, b.callId, b.room_name, call.id, call.call_id));
  return {
    b,
    vaaniCallId,
    callerNumber: str(b.caller_number, b.from, call.from, call.caller_number, obj(call.customer).number),
    startedAt: date(b.started_at ?? call.started_at ?? call.startedAt),
    answeredAt: date(b.answered_at ?? call.answered_at ?? call.answeredAt),
  };
}

function toolArgs(b: Body): Body {
  const nested = b.answers ?? b.arguments ?? b.args ?? b.parameters ?? b.input;
  return nested === undefined ? b : obj(nested);
}

export function parseQualifyRequest(raw: unknown) {
  const meta = callMeta(raw);
  // Field by field, so one malformed value does not drop the rest of the caller's answers.
  const answers: Answers = {};
  for (const [key, value] of Object.entries(toolArgs(meta.b))) {
    // Vaani's template sends "" for anything not collected yet; that must not erase earlier answers.
    if (typeof value === "string" && (!value.trim() || unfilled(value) === null)) continue;
    const field = answersSchema.shape[key as keyof Answers];
    const parsed = field?.safeParse(value);
    if (parsed?.success && parsed.data != null) Object.assign(answers, { [key]: parsed.data });
  }
  return { vaaniCallId: meta.vaaniCallId, callerNumber: meta.callerNumber, startedAt: meta.startedAt, answeredAt: meta.answeredAt, answers };
}

export function parseSlotsRequest(raw: unknown) {
  const b = obj(raw);
  return { vaaniCallId: str(b.call_id, b.callId, obj(b.call).id) };
}

export function parseBookRequest(raw: unknown) {
  const meta = callMeta(raw);
  const args = toolArgs(meta.b);
  const start = str(args.slot_start, meta.b.slot_start, args.start);
  // A time without an offset (the LLM may drop it) is studio time, not UTC.
  const d = date(start && !/(Z|[+-]\d{2}:?\d{2})$/i.test(start) ? `${start}+05:30` : start);
  if (!d) throw new Error("Missing or invalid slot_start");
  return { vaaniCallId: meta.vaaniCallId, slotStart: d.toISOString(), name: str(args.name, meta.b.name) };
}

const SPEAKER = (role: string) => (/agent|assistant|bot/i.test(role) ? "Agent" : "Caller");

function flattenTranscript(t: unknown): string | null {
  if (typeof t === "string") {
    // Vaani: "[13:33:14] AGENT: text\n\n[13:33:19] USER: text"
    return t
      .split(/\n+/)
      .filter((l) => l.trim())
      .map((l) => l.replace(/^(\[[^\]]*\]\s*)?(AGENT|ASSISTANT|BOT|USER|CALLER)\s*:/i, (_m, ts = "", who) => `${ts}${SPEAKER(who)}:`))
      .join("\n");
  }
  if (!Array.isArray(t)) return null;
  return t
    .map((turn) => {
      const o = obj(turn);
      return `${SPEAKER(str(o.role, o.speaker) ?? "")}: ${str(o.text, o.content, o.message) ?? ""}`;
    })
    .join("\n");
}

export type VaaniEvent = ReturnType<typeof parseVaaniEvent>;

/** Account-level Vaani webhook: call_started, user_picked_up_at, call_ended, call_postprocessing, ... */
export function parseVaaniEvent(raw: unknown) {
  const b = obj(raw);
  const event = str(b.event);
  if (!event) throw new Error("Missing event name");
  const data = obj(b.data);
  const vaaniCallId = str(b.room_name, b.call_id, data.room_name, data.call_id);
  if (!vaaniCallId) throw new Error("Missing call id (room_name)");

  // call_ended reports seconds; call_postprocessing reports milliseconds.
  const rawDuration = Number(b.call_duration ?? data.call_duration);
  const durationSec = Number.isFinite(rawDuration) && rawDuration > 0
    ? Math.round(event === "call_postprocessing" ? rawDuration / 1000 : rawDuration)
    : null;
  const at = date(b.timestamp ?? data.timestamp);

  return {
    event,
    vaaniCallId,
    callerNumber: str(b.phone_number, b.caller_number, b.from, data.phone_number, data.caller_number),
    at: at && !Number.isNaN(at.getTime()) ? at : null,
    durationSec,
    voiceMinutes: durationSec === null ? null : Math.ceil(durationSec / 60),
    transcript: flattenTranscript(b.transcript ?? data.transcript),
    summary: str(b.summary, data.summary),
  };
}
