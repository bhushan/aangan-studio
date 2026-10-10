// Simulates Vaani calls against the deployed app, then reads the rows back from Neon.
//   npm run smoke                        five test calls, removed afterwards ("smoke-" room names)
//   npm run smoke -- --keep              same, but keep them
//   npm run smoke -- --demo --keep       the September phone enquiries as realistic calls ("demo-" room names)
//   npm run smoke -- --purge <prefix>    remove kept or browser-test calls, e.g. --purge demo- or --purge webrtc-
//                                        (Neon rows, HubSpot records, Cal.com bookings)
// Unless --keep, Neon rows, HubSpot records and Cal.com bookings are removed afterwards. Telegram messages stay.
import "./load-env";
import { neon } from "@neondatabase/serverless";
import { env } from "../lib/env";
import { buildDemoCalls, type DemoCall } from "./demo-calls";

const APP = env("APP_URL").replace(/\/$/, "");
const headers = { "content-type": "application/json", "x-aangan-secret": env("VAANI_TOOL_SECRET") };
const demo = process.argv.includes("--demo");
const run = `${demo ? "demo" : "smoke"}-${Date.now()}`;

async function post(path: string, body: unknown) {
  const t = Date.now();
  const res = await fetch(`${APP}/api/vaani/${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ms: Date.now() - t, json: json as Record<string, unknown> };
}

async function call(name: string, phone: string, answers: Record<string, unknown> | null, opts: { withCallId?: boolean; book?: boolean } = {}) {
  const room = `${run}-${name}`;
  console.log(`\n## ${name}`);
  await post("webhook", { event: "call_started", room_name: room, phone_number: phone });
  if (answers) {
    const q = await post("qualify", opts.withCallId === false ? answers : { call_id: room, answers });
    console.log(`qualify ${q.status} in ${q.ms} ms -> ${q.json.route} / ${q.json.next_step}: "${q.json.say}"`);
    if (q.json.next_step === "offer_slots") {
      const s = await post("slots", { call_id: room });
      console.log(`slots ${s.status} in ${s.ms} ms -> "${s.json.say}"`);
      const first = (s.json.slots as { start: string }[] | undefined)?.[0];
      if (first && opts.book) {
        const b = await post("book", { call_id: room, slot_start: first.start });
        console.log(`book ${b.status} in ${b.ms} ms -> ${b.json.booked}: "${b.json.say}"`);
      }
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

/** One realistic call: rings at its (past) time, is answered, qualified, maybe booked, then ends with a transcript. */
async function demoCall(c: DemoCall) {
  const room = `${run}-${c.key}`;
  const at = (ms: number) => new Date(c.startedAt.getTime() + ms).toISOString();
  console.log(`\n## ${c.key} (${c.startedAt.toISOString()})`);
  await post("webhook", { event: "call_started", room_name: room, phone_number: c.phone, timestamp: at(0) });
  await post("webhook", { event: "user_picked_up_at", room_name: room, timestamp: at(3000) });
  if (c.answers) {
    // The agent re-checks after each follow-up; the caller has already said all they will, so resend as is.
    let q = await post("qualify", { call_id: room, answers: c.answers });
    for (let i = 0; i < 2 && q.json.next_step === "ask"; i++) q = await post("qualify", { call_id: room, answers: c.answers });
    console.log(`qualify -> ${q.json.route} / ${q.json.next_step}`);
    if (q.json.next_step === "offer_slots" && c.pick !== null) {
      const s = await post("slots", { call_id: room });
      const slot = (s.json.slots as { start: string }[] | undefined)?.[c.pick];
      if (slot) {
        const b = await post("book", { call_id: room, slot_start: slot.start });
        console.log(`book -> ${b.json.booked}: "${b.json.say}"`);
      }
    }
  }
  await post("webhook", { event: "call_ended", room_name: room, call_duration: c.durationSec });
  const p = await post("webhook", {
    event: "call_postprocessing",
    call_id: room,
    data: { room_name: room, call_duration: c.durationSec * 1000, transcript: c.transcript },
  });
  console.log(`ended and reviewed -> ${JSON.stringify(p.json)}`);
}

/** Removes kept calls by room-name prefix: HubSpot records, Cal.com bookings, then the Neon rows. */
async function purge(prefix: string) {
  const sql = neon(env("DATABASE_URL"));
  const rows = (await sql.query(
    "select vaani_call_id, booking_uid, hubspot_contact_id, hubspot_call_id, hubspot_deal_id, hubspot_task_id from calls where vaani_call_id like $1",
    [`${prefix}%`],
  )) as Record<string, unknown>[];
  const token = process.env.HUBSPOT_TOKEN;
  let removed = 0;
  let cancelled = 0;
  for (const r of rows) {
    for (const [type, id] of [["calls", r.hubspot_call_id], ["tasks", r.hubspot_task_id], ["deals", r.hubspot_deal_id], ["contacts", r.hubspot_contact_id]]) {
      if (!id || !token) continue;
      const res = await fetch(`https://api.hubapi.com/crm/v3/objects/${type}/${id}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
      if (res.ok) removed++;
    }
    if (r.booking_uid && process.env.CALCOM_API_KEY) {
      const res = await fetch(`https://api.cal.com/v2/bookings/${r.booking_uid}/cancel`, {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.CALCOM_API_KEY}`, "cal-api-version": "2024-08-13", "content-type": "application/json" },
        body: JSON.stringify({ cancellationReason: "Automated test call removed" }),
      });
      if (res.ok) cancelled++;
      else console.log(`cancel ${r.booking_uid} by hand (${res.status})`);
    }
  }
  await sql.query("delete from calls where vaani_call_id like $1", [`${prefix}%`]);
  console.log(`${rows.length} calls removed, ${removed} HubSpot records deleted, ${cancelled} Cal.com bookings cancelled`);
}

async function main() {
  const purgeAt = process.argv.indexOf("--purge");
  if (purgeAt !== -1) {
    const prefix = process.argv[purgeAt + 1];
    // webrtc- = calls placed from Vaani's in-browser tester, never from a real phone line.
    if (!prefix || !/^(smoke|demo|webrtc)-/.test(prefix)) throw new Error("--purge needs a prefix starting with smoke-, demo- or webrtc-");
    return purge(prefix);
  }
  if (demo) {
    const calls = await buildDemoCalls(new Date());
    for (const c of calls) await demoCall(c);
    if (!process.argv.includes("--keep")) await purge(run);
    else console.log(`\nKept ${calls.length} demo calls. Remove them with: npm run smoke -- --purge ${run}`);
    return;
  }

  const unauth = await fetch(`${APP}/api/vaani/qualify`, { method: "POST", body: "{}" });
  console.log(`no secret -> ${unauth.status} (expect 401)`);

  await call("qualified", "+910000000101", {
    name: "Test Priya", locality: "Kothrud", property_type: "home", scope: "Full 3BHK redesign with execution",
    size_sqft: 1400, completion: "March 2027", decision_maker: "Owner, husband agrees",
  }, { book: true });
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
    "select vaani_call_id, caller_number, route, close_reason, booking_uid, duration_sec, ai_cost_usd, ai_latency_ms, telegram_sent_at is not null as telegram, hubspot_contact_id, hubspot_call_id, hubspot_deal_id, hubspot_task_id from calls where vaani_call_id like $1 order by created_at",
    [`${run}%`],
  )) as Record<string, unknown>[];
  console.log("\n## Neon rows");
  console.table(rows.map((r) => ({ ...r, vaani_call_id: String(r.vaani_call_id).replace(`${run}-`, "") })));

  if (!process.argv.includes("--keep")) await purge(run);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
