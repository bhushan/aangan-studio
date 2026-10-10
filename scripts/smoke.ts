// Simulates Vaani calls against the deployed app, then reads the rows back from Neon.
// Usage: npx tsx scripts/smoke.ts [--keep]   (test rows use room names starting with "smoke-" and are deleted unless --keep)
import "./load-env";
import { neon } from "@neondatabase/serverless";
import { env } from "../lib/env";

const APP = env("APP_URL").replace(/\/$/, "");
const headers = { "content-type": "application/json", "x-aangan-secret": env("VAANI_TOOL_SECRET") };
const run = `smoke-${Date.now()}`;

async function post(path: string, body: unknown) {
  const t = Date.now();
  const res = await fetch(`${APP}/api/vaani/${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ms: Date.now() - t, json: json as Record<string, unknown> };
}

async function call(name: string, phone: string, answers: Record<string, unknown> | null, opts: { withCallId?: boolean } = {}) {
  const room = `${run}-${name}`;
  console.log(`\n## ${name}`);
  await post("webhook", { event: "call_started", room_name: room, phone_number: phone });
  if (answers) {
    const q = await post("qualify", opts.withCallId === false ? answers : { call_id: room, answers });
    console.log(`qualify ${q.status} in ${q.ms} ms -> ${q.json.route} / ${q.json.next_step}: "${q.json.say}"`);
    if (q.json.next_step === "offer_slots") {
      const s = await post("slots", { call_id: room });
      console.log(`slots ${s.status} in ${s.ms} ms -> "${s.json.say}"`);
    }
  }
  const e = await post("webhook", { event: "call_ended", room_name: room, call_duration: 95.4 });
  console.log(`call_ended ${e.status} -> ${JSON.stringify(e.json)}`);
  const p = await post("webhook", {
    event: "call_postprocessing",
    call_id: room,
    data: { room_name: room, call_duration: 95400, transcript: "[10:00:00] AGENT: Aangan Studio, how can I help?\n\n[10:00:04] USER: (simulated)" },
  });
  console.log(`call_postprocessing ${p.status} -> ${JSON.stringify(p.json)}`);
}

async function main() {
  const unauth = await fetch(`${APP}/api/vaani/qualify`, { method: "POST", body: "{}" });
  console.log(`no secret -> ${unauth.status} (expect 401)`);

  await call("qualified", "+910000000101", {
    name: "Test Priya", locality: "Kothrud", property_type: "home", scope: "Full 3BHK redesign with execution",
    size_sqft: 1400, completion: "March 2027", decision_maker: "Owner, husband agrees",
  });
  await call("rejected", "+910000000102", {
    name: "Test Suresh", locality: "Nashik", property_type: "home", scope: "Home office and study redesign with execution",
    completion: "Early next year", decision_maker: "Owner",
  });
  await call("complaint", "+910000000103", {
    name: "Test Sheetal", locality: "Viman Nagar", notes: "Existing client. Project running three months, designer has not replied in five days. Wants Nikhil to call back.",
  });
  await call("dropped", "+910000000104", null);
  await call("no-call-id", "+910000000105", {
    name: "Test Ritu", locality: "Pimple Saudagar", property_type: "home", scope: "Kitchen, wardrobes, living room with execution",
    completion: "March 2027", decision_maker: "Owner",
  }, { withCallId: false });

  const sql = neon(env("DATABASE_URL"));
  const rows = (await sql.query(
    "select vaani_call_id, caller_number, route, close_reason, after_hours, duration_sec, voice_minutes, ai_cost_usd, ai_latency_ms, length(transcript) as transcript_len from calls where vaani_call_id like $1 order by created_at",
    [`${run}%`],
  )) as Record<string, unknown>[];
  console.log("\n## Neon rows");
  console.table(rows.map((r) => ({ ...r, vaani_call_id: String(r.vaani_call_id).replace(`${run}-`, "") })));

  if (!process.argv.includes("--keep")) {
    await sql.query("delete from calls where vaani_call_id like $1", [`${run}%`]);
    console.log("test rows deleted (pass --keep to keep them)");
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
