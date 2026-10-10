// Shows recent calls from Neon until the dashboard exists.
//   npm run calls              last 15 calls
//   npm run calls -- <id>      one call in full (row id or Vaani room name), with transcript
import "./load-env";
import { neon } from "@neondatabase/serverless";
import { createNeonRepo, toCall } from "../lib/calls/neon-repo";
import { env } from "../lib/env";
import { formatSlot } from "../lib/time";
import { CRITERIA } from "../lib/rubric/schema";

async function main() {
  const id = process.argv[2];
  const sql = neon(env("DATABASE_URL"));

  if (!id) {
    const rows = ((await sql.query("select * from calls order by started_at desc limit 15")) as Record<string, unknown>[]).map(toCall);
    if (!rows.length) return console.log("No calls yet.");
    console.table(
      rows.map((c) => ({
        when: formatSlot(c.startedAt) + (c.afterHours ? " *" : ""),
        caller: c.answers.name ?? c.callerNumber ?? "-",
        area: c.answers.locality ?? "-",
        route: c.route ?? "in progress",
        reason: c.closeReason ?? (c.flags.length ? `flags: ${c.flags.join(",")}` : ""),
        booked: c.bookingAt ? formatSlot(c.bookingAt) : "",
        telegram: c.telegramSentAt ? "sent" : "",
        hubspot: c.hubspotCallId ? "synced" : "",
        "AI $": c.aiCostUsd?.toFixed(4) ?? "",
        id: c.vaaniCallId,
      })),
    );
    return console.log("* after hours. Details: npm run calls -- <id>");
  }

  const repo = createNeonRepo(env("DATABASE_URL"));
  const c = (await repo.findById(id)) ?? (await repo.findByVaaniId(id));
  if (!c) return console.log(`No call ${id}`);
  console.log(`${c.vaaniCallId}  ${formatSlot(c.startedAt)}${c.afterHours ? " (after hours)" : ""}`);
  console.log(`caller ${c.callerNumber ?? "-"} | route ${c.route ?? "-"} ${c.closeReason ?? ""} | ${c.durationSec ?? "-"} s | AI ${c.aiLatencyMs ?? "-"} ms, $${c.aiCostUsd ?? "-"}`);
  console.log("\nanswers", c.answers);
  if (c.assessment) for (const k of CRITERIA) console.log(`  ${k}: ${c.assessment.criteria[k].verdict}  ${c.assessment.criteria[k].evidence}`);
  console.log(`\nbooking ${c.bookingUid ?? "-"} | telegram ${c.telegramSentAt ? "sent" : "-"} | hubspot contact ${c.hubspotContactId ?? "-"}, call ${c.hubspotCallId ?? "-"}, deal ${c.hubspotDealId ?? "-"}, task ${c.hubspotTaskId ?? "-"}`);
  console.log(`\n${c.transcript ?? "(no transcript yet)"}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
