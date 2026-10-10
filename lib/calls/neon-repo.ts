import { neon } from "@neondatabase/serverless";
import type { CallPatch, CallsRepo } from "./repo";
import type { CallRecord } from "./types";

// camelCase field -> column. Also the whitelist for dynamic updates.
const COLUMNS = {
  callerNumber: "caller_number",
  startedAt: "started_at",
  answeredAt: "answered_at",
  endedAt: "ended_at",
  afterHours: "after_hours",
  answers: "answers",
  assessment: "assessment",
  route: "route",
  closeReason: "close_reason",
  flags: "flags",
  askCount: "ask_count",
  bookingUid: "booking_uid",
  bookingAt: "booking_at",
  hubspotContactId: "hubspot_contact_id",
  hubspotCallId: "hubspot_call_id",
  hubspotDealId: "hubspot_deal_id",
  hubspotTaskId: "hubspot_task_id",
  telegramSentAt: "telegram_sent_at",
  transcript: "transcript",
  durationSec: "duration_sec",
  voiceMinutes: "voice_minutes",
  aiCostUsd: "ai_cost_usd",
  aiLatencyMs: "ai_latency_ms",
} as const satisfies Record<keyof CallPatch, string>;

const JSON_COLUMNS = new Set(["answers", "assessment"]);

type Row = Record<string, unknown>;
const d = (v: unknown) => (v == null ? null : new Date(v as string));
const n = (v: unknown) => (v == null ? null : Number(v));

export function toCall(r: Row): CallRecord {
  return {
    id: r.id as string,
    vaaniCallId: r.vaani_call_id as string,
    callerNumber: (r.caller_number as string) ?? null,
    startedAt: new Date(r.started_at as string),
    answeredAt: d(r.answered_at),
    endedAt: d(r.ended_at),
    afterHours: r.after_hours as boolean,
    answers: (r.answers as CallRecord["answers"]) ?? {},
    assessment: (r.assessment as CallRecord["assessment"]) ?? null,
    route: (r.route as CallRecord["route"]) ?? null,
    closeReason: (r.close_reason as CallRecord["closeReason"]) ?? null,
    flags: (r.flags as CallRecord["flags"]) ?? [],
    askCount: Number(r.ask_count ?? 0),
    bookingUid: (r.booking_uid as string) ?? null,
    bookingAt: d(r.booking_at),
    hubspotContactId: (r.hubspot_contact_id as string) ?? null,
    hubspotCallId: (r.hubspot_call_id as string) ?? null,
    hubspotDealId: (r.hubspot_deal_id as string) ?? null,
    hubspotTaskId: (r.hubspot_task_id as string) ?? null,
    telegramSentAt: d(r.telegram_sent_at),
    transcript: (r.transcript as string) ?? null,
    durationSec: n(r.duration_sec),
    voiceMinutes: n(r.voice_minutes),
    aiCostUsd: n(r.ai_cost_usd),
    aiLatencyMs: n(r.ai_latency_ms),
  };
}

export function createNeonRepo(databaseUrl: string): CallsRepo {
  const sql = neon(databaseUrl);
  const one = async (text: string, params: unknown[]) => {
    const rows = (await sql.query(text, params)) as Row[];
    return rows[0] ? toCall(rows[0]) : null;
  };

  return {
    findByVaaniId: (v) => one("select * from calls where vaani_call_id = $1", [v]),
    findById: (id) => one("select * from calls where id = $1", [id]),

    async create(c) {
      // Concurrent first requests for the same call (qualify racing call-ended) resolve to one row.
      const row = await one(
        `insert into calls (vaani_call_id, caller_number, started_at, answered_at, after_hours)
         values ($1, $2, $3, $4, $5)
         on conflict (vaani_call_id) do update set vaani_call_id = excluded.vaani_call_id
         returning *`,
        [c.vaaniCallId, c.callerNumber, c.startedAt, c.answeredAt, c.afterHours],
      );
      return row!;
    },

    async update(id, patch) {
      const entries = Object.entries(patch).filter(([k, v]) => k in COLUMNS && v !== undefined);
      if (!entries.length) return (await one("select * from calls where id = $1", [id]))!;
      const sets = entries.map(([k], i) => `${COLUMNS[k as keyof typeof COLUMNS]} = $${i + 2}`);
      const params = entries.map(([k, v]) =>
        JSON_COLUMNS.has(COLUMNS[k as keyof typeof COLUMNS]) && v !== null ? JSON.stringify(v) : v,
      );
      const row = await one(`update calls set ${sets.join(", ")} where id = $1 returning *`, [id, ...params]);
      if (!row) throw new Error(`No call ${id}`);
      return row;
    },

    async priorCalls(number, before) {
      const rows = (await sql.query(
        "select * from calls where caller_number = $1 and started_at < $2 order by started_at desc limit 20",
        [number, before],
      )) as Row[];
      return rows.map(toCall);
    },
  };
}
