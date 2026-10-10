// Realistic demo calls for `npm run smoke -- --demo`: the September phone enquiries from the case file,
// replayed as if the voice agent had answered them over the last fortnight. What the agent "heard" is
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

// day = days before today; at = IST time of day. Roughly a third after hours, as in the case brief.
const PLAN: Record<string, { day: number; at: string; pick?: number | null; hangUpAfter?: number }> = {
  T01: { day: 13, at: "10:23", pick: 0 },
  T02: { day: 13, at: "21:40", pick: 1 },
  T03: { day: 12, at: "11:15" },
  T04: { day: 11, at: "16:05" },
  T05: { day: 11, at: "22:18", pick: 2 },
  T06: { day: 10, at: "12:42", pick: 0 },
  T07: { day: 9, at: "19:55" },
  T09: { day: 9, at: "11:32" },
  T10: { day: 8, at: "14:20" },
  T11: { day: 7, at: "08:47" },
  T12: { day: 6, at: "20:31", pick: null },
  T13: { day: 6, at: "15:10" },
  T14: { day: 5, at: "23:05", pick: 1 },
  T15: { day: 4, at: "09:12", pick: 2 },
  T17: { day: 3, at: "21:58", hangUpAfter: 5 },
  T16: { day: 1, at: "18:40", pick: 0 },
  T18: { day: 2, at: "13:25" },
  T19: { day: 2, at: "07:50" },
  T20: { day: 1, at: "22:36", pick: 1 },
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
    const full = durationOf(e.header);
    const durationSec = plan.hangUpAfter ? 48 : full;
    const transcript = toVaani(e.text, startedAt, full, plan.hangUpAfter);
    // What the agent would have passed to /qualify: the details the caller actually gave.
    const answers = plan.hangUpAfter ? null : (await review(transcript, { now })).answers;
    calls.push({ key: e.id, phone: phoneFor(e.id), startedAt, durationSec, transcript, answers, pick: plan.pick ?? null });
  }

  // Girish (T16) says he called on Monday and nobody got back: that earlier call, cut off early.
  const girish = calls.find((c) => c.key === "T16");
  if (girish) {
    const startedAt = new Date(girish.startedAt.getTime() - 2 * 86400_000 - 3 * 3600_000);
    calls.push({
      key: "T16-first",
      phone: girish.phone,
      startedAt,
      durationSec: 31,
      transcript: `[${startedAt.toISOString().slice(11, 19)}] AGENT: Thank you for calling Aangan Studio, how can I help you today?\n\n[${new Date(startedAt.getTime() + 6000).toISOString().slice(11, 19)}] USER: Hi, I'm Girish, I have a 3BHK in Viman Nagar and wanted to talk about`,
      answers: null,
      pick: null,
    });
  }
  return calls.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
}
