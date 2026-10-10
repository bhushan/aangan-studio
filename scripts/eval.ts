// Runs the live 5-criteria check over the 40 September enquiries and scores routes against labels.json.
// Needs GOOGLE_GENERATIVE_AI_API_KEY. Usage: npm run eval   (writes eval/last-run.md)
import "./load-env";
import fs from "node:fs";
import { loadStudioFiles } from "../lib/agent-prompt";
import { env } from "../lib/env";
import { createAssess, DEFAULT_QUALIFY_MODEL } from "../lib/rubric/qualify";
import { decideRoute, type Decision } from "../lib/rubric/route";
import type { Route } from "../lib/calls/types";

type Enquiry = { id: string; channel: string; header: string; text: string };
type Label = { accept?: string[]; reason?: string; skip?: boolean; why: string };

const enquiries: Enquiry[] = JSON.parse(fs.readFileSync("studio/transcripts/enquiries.json", "utf8"));
const { labels }: { labels: Record<string, Label> } = JSON.parse(fs.readFileSync("studio/transcripts/labels.json", "utf8"));

// "T01 · Phone · 2 September · 10:23am" -> the enquiry's own date, so timelines are judged as of that day.
function enquiryDate(header: string): Date {
  const m = header.match(/(\d{1,2})(?:–\d{1,2})? (September|October)/);
  return m ? new Date(`${m[1]} ${m[2]} 2026 12:00 GMT+0530`) : new Date("2026-09-15T12:00:00+05:30");
}

const matches = (route: Route, accept: string[]) =>
  accept.some((a) => a === route || (a === "qualified*" && (route === "qualified" || route === "qualified_flagged")));

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

async function main() {
  env("GOOGLE_GENERATIVE_AI_API_KEY"); // fail fast with a clear message
  // Eval allows a longer timeout than live calls so slow responses are measured, not dropped.
  const assess = createAssess({ files: loadStudioFiles(), model: process.env.QUALIFY_MODEL || undefined, timeoutMs: 15000 });
  const cases = enquiries.filter((e) => !labels[e.id]?.skip);

  const results = await pool(cases, 4, async (e) => {
    const label = labels[e.id];
    try {
      const r = await assess({}, { now: enquiryDate(e.header), transcript: `${e.header}\n${e.text}` });
      const d: Decision = decideRoute(r.assessment, { askCount: 0 });
      const ok = matches(d.route, label.accept ?? []) && (!label.reason || d.route !== "close" || d.closeReason === label.reason);
      return { e, label, d, r, ok, error: null as string | null };
    } catch (err) {
      return { e, label, d: null, r: null, ok: false, error: (err as Error).message };
    }
  });

  const shouldClose = results.filter((x) => x.label.accept?.every((a) => a === "close"));
  const falseQualified = shouldClose.filter((x) => x.d && (x.d.route === "qualified" || x.d.route === "qualified_flagged"));
  const complaints = results.filter((x) => x.label.accept?.length === 1 && x.label.accept[0] === "escalate");
  const missedComplaints = complaints.filter((x) => x.d?.route !== "escalate");
  const latencies = results.flatMap((x) => (x.r ? [x.r.latencyMs] : [])).sort((a, b) => a - b);
  const p = (q: number) => latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))] ?? 0;
  const cost = results.reduce((s, x) => s + (x.r?.costUsd ?? 0), 0);
  const passed = results.filter((x) => x.ok).length;

  const rows = results.map((x) => {
    const got = x.error ? `error: ${x.error}` : `${x.d!.route}${x.d!.closeReason ? ` (${x.d!.closeReason})` : ""}${x.d!.flags.length ? ` flags: ${x.d!.flags.join(",")}` : ""}`;
    return `| ${x.ok ? "ok" : "**MISS**"} | ${x.e.id} | ${x.label.accept?.join(" / ")}${x.label.reason ? ` (${x.label.reason})` : ""} | ${got} | ${x.r?.latencyMs ?? "-"} ms |`;
  });

  const report = `# Qualify eval

Model: ${process.env.QUALIFY_MODEL || DEFAULT_QUALIFY_MODEL} · ${new Date().toISOString()}

- Route accuracy: **${passed}/${results.length}**
- False "qualified" on enquiries that should close: **${falseQualified.length}** ${falseQualified.map((x) => x.e.id).join(", ")}
- Complaints not escalated: **${missedComplaints.length}** ${missedComplaints.map((x) => x.e.id).join(", ")}
- Latency p50 ${p(0.5)} ms, p95 ${p(0.95)} ms (live calls time out at 2,000 ms)
- AI cost for the run: $${cost.toFixed(4)} (${results.length ? `$${(cost / results.length).toFixed(5)} per check` : "-"})

Labels are drafts in \`studio/transcripts/labels.json\` and need Nikhil's review.

| | Id | Expected | Got | Latency |
|---|---|---|---|---|
${rows.join("\n")}
`;
  fs.mkdirSync("eval", { recursive: true });
  fs.writeFileSync("eval/last-run.md", report);
  console.log(report);
  if (falseQualified.length || missedComplaints.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
