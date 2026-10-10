// Realistic demo calls for `npm run smoke -- --demo`: one September phone enquiry from the case file per
// outcome, replayed as if the voice agent had answered it in the last ten days. What the agent "heard" is
// extracted from each transcript by the same Gemini review production uses, so every verdict on the
// dashboard is real model output. Times are spread across the day so some land after hours.
import fs from "node:fs";
import path from "node:path";
import { loadStudioFiles } from "../lib/agent-prompt";
import type { Answers } from "../lib/rubric/schema";
import { createReview } from "../lib/rubric/review";

type Enquiry = { id: string; channel: string; header: string; text: string };

export type DemoCall = {
  key: string;
  phone: string;
  startedAt: Date;
  durationSec: number;
  transcript: string;
  /** Null when the caller hung up before the agent could check anything. */
  answers: Answers | null;
  /** Which offered slot the caller picks (0-2), or null to leave it unbooked. */
  pick: number | null;
};

// One case-file call per outcome, all placed today. day = days before today; at = IST time of day,
// half of them outside 10am to 7pm. `heard` adds what the caller would have told our agent but the
// case-file transcript leaves out (the agent always asks for a name and the area).
const PLAN: Record<string, { day: number; at: string; pick?: number | null; hangUpAfter?: number; heard?: Answers }> = {
  T11: { day: 0, at: "08:47", heard: { name: "Sneha Iyer" } }, // senior callback: timeline still unclear
  T01: { day: 0, at: "10:23", pick: 0 }, // booked
  T03: { day: 0, at: "11:15" }, // not a fit: outside Pune
  T09: { day: 0, at: "11:32" }, // complaint
  T10: { day: 0, at: "14:20", heard: { name: "Amit Desai" } }, // not a fit: budget
  T04: { day: 0, at: "16:05", heard: { name: "Kavita Joshi", locality: "Baner" } }, // not a fit: advice only
  T07: { day: 0, at: "19:55", heard: { name: "Meera Kulkarni", locality: "Hadapsar", completion: "Before Diwali, about three weeks from now" } }, // not a fit: timeline
  T12: { day: 0, at: "20:31", pick: null }, // qualified, not booked: wants a site visit
  T02: { day: 0, at: "21:40", pick: 1, heard: { name: "Rohan Mehta" } }, // qualified with a flag, booked
  T17: { day: 0, at: "22:05", hangUpAfter: 5 }, // caller cut off
};

/** A plausible Indian mobile number per enquiry, stable across runs. */
function phoneFor(id: string): string {
  let h = 7;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 100_000_000;
  return `+9198${String(h).padStart(8, "0")}`;
}

function istAt(daysAgo: number, hhmm: string, now: Date): Date {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  const [h, m] = hhmm.split(":").map(Number);
  const d = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - daysAgo, h, m);
  return new Date(d - 5.5 * 3600_000);
}

function durationOf(header: string): number {
  const m = /(\d+)\s*min\s*(\d+)?\s*sec/i.exec(header);
  return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : 120;
}

/** The case file's "Front Desk:/Caller:" text as Vaani's "[hh:mm:ss] AGENT:/USER:" transcript. */
function toVaani(text: string, start: Date, durationSec: number, keepTurns?: number): string {
  const turns: { who: string; text: string }[] = [];
  for (const line of text.split("\n")) {
    const m = /^(Front Desk|Caller):\s*(.*)$/.exec(line.trim());
    if (m) turns.push({ who: m[1] === "Front Desk" ? "AGENT" : "USER", text: m[2] });
    else if (turns.length && line.trim()) turns[turns.length - 1].text += ` ${line.trim()}`;
  }
  const kept = keepTurns ? turns.slice(0, keepTurns) : turns;
  const step = durationSec / Math.max(turns.length, 1);
  return kept
    .map((t, i) => {
      const ts = new Date(start.getTime() + Math.round(i * step) * 1000).toISOString().slice(11, 19);
      return `[${ts}] ${t.who}: ${t.text.replace(/[—–]/g, ",")}`;
    })
    .join("\n\n");
}

export async function buildDemoCalls(now: Date): Promise<DemoCall[]> {
  const enquiries: Enquiry[] = JSON.parse(fs.readFileSync(path.join("studio", "transcripts", "enquiries.json"), "utf8"));
  const review = createReview({ files: loadStudioFiles() });
  const calls: DemoCall[] = [];

  for (const e of enquiries.filter((x) => PLAN[x.id])) {
    const plan = PLAN[e.id];
    const startedAt = istAt(plan.day, plan.at, now);
    if (startedAt > now) throw new Error(`${e.id} would start in the future (${plan.at} IST); run later or move it earlier`);
    const full = durationOf(e.header);
    const durationSec = plan.hangUpAfter ? 48 : full;
    const transcript = toVaani(e.text, startedAt, full, plan.hangUpAfter);
    // What the agent would have passed to /qualify: the details the caller actually gave.
    const answers = plan.hangUpAfter ? null : { ...(await review(transcript, { now })).answers, ...plan.heard };
    calls.push({ key: e.id, phone: phoneFor(e.id), startedAt, durationSec, transcript, answers, pick: plan.pick ?? null });
  }

  return calls.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
}
