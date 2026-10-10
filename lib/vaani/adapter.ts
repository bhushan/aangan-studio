import { timingSafeEqual } from "node:crypto";
import { answersSchema, type Answers } from "../rubric/schema";

// Vaani's tool and webhook payloads are not public. Everything Vaani-shaped is normalised here,
// so the rest of the app only sees our own contract. Adjust the pickers after the first live call.

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
const str = (...vs: unknown[]) => vs.find((v): v is string => typeof v === "string" && v.length > 0) ?? null;
const date = (v: unknown) => (typeof v === "string" || typeof v === "number" ? new Date(v) : null);

export function isAuthorized(headers: Headers, secret: string | undefined): boolean {
  if (!secret) return false;
  const given = headers.get("x-aangan-secret") ?? headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function callMeta(raw: unknown) {
  const b = obj(raw);
  const call = obj(b.call);
  const vaaniCallId = str(b.call_id, b.callId, call.id, call.call_id);
  if (!vaaniCallId) throw new Error("Missing call id");
  return {
    b,
    vaaniCallId,
    callerNumber: str(b.caller_number, b.from, call.from, call.caller_number, obj(call.customer).number),
    startedAt: date(b.started_at ?? call.started_at ?? call.startedAt),
    answeredAt: date(b.answered_at ?? call.answered_at ?? call.answeredAt),
  };
}

function toolArgs(b: Body): Body {
  return obj(b.answers ?? b.arguments ?? b.args ?? b.parameters ?? b.input);
}

export function parseQualifyRequest(raw: unknown) {
  const meta = callMeta(raw);
  // Field by field, so one malformed value does not drop the rest of the caller's answers.
  const answers: Answers = {};
  for (const [key, value] of Object.entries(toolArgs(meta.b))) {
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
  const d = start ? new Date(start) : null;
  if (!d || Number.isNaN(d.getTime())) throw new Error("Missing or invalid slot_start");
  return { vaaniCallId: meta.vaaniCallId, slotStart: d.toISOString(), name: str(args.name, meta.b.name) };
}

function flattenTranscript(t: unknown): string | null {
  if (typeof t === "string") return t;
  if (!Array.isArray(t)) return null;
  return t
    .map((turn) => {
      const o = obj(turn);
      const role = str(o.role, o.speaker) ?? "";
      const who = /agent|assistant|bot/i.test(role) ? "Agent" : "Caller";
      return `${who}: ${str(o.text, o.content, o.message) ?? ""}`;
    })
    .join("\n");
}

export function parseCallEnded(raw: unknown) {
  const meta = callMeta(raw);
  const b = meta.b;
  const call = obj(b.call);
  const endedAt = date(b.ended_at ?? call.ended_at ?? call.endedAt);
  const explicit = Number(b.duration_sec ?? b.duration ?? call.duration);
  const durationSec = Number.isFinite(explicit) && explicit > 0
    ? Math.round(explicit)
    : meta.startedAt && endedAt
      ? Math.round((endedAt.getTime() - meta.startedAt.getTime()) / 1000)
      : null;
  return {
    vaaniCallId: meta.vaaniCallId,
    callerNumber: meta.callerNumber,
    startedAt: meta.startedAt,
    answeredAt: meta.answeredAt,
    endedAt,
    durationSec,
    voiceMinutes: durationSec === null ? null : Math.ceil(durationSec / 60),
    transcript: flattenTranscript(b.transcript ?? call.transcript),
  };
}
