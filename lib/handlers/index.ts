import type { CallsRepo } from "../calls/repo";
import { isQualified, type CallRecord, type Route } from "../calls/types";
import { buildHandoffNote } from "../handoff-note";
import type { Calcom, Slot } from "../integrations/calcom";
import type { Hubspot } from "../integrations/hubspot";
import type { Telegram } from "../integrations/telegram";
import { ASK_FALLBACK, CLOSE_LINES, LINES } from "../rubric/lines";
import { decideRoute, type Decision } from "../rubric/route";
import type { Answers, Assessment } from "../rubric/schema";
import { formatSlot, isAfterHours } from "../time";
import { parseBookRequest, parseCallEnded, parseQualifyRequest, parseSlotsRequest } from "../vaani/adapter";

// Request handlers behind the four /api/vaani/* routes. Route files stay thin; all I/O comes in as deps.

export type AssessResult = { assessment: Assessment; costUsd: number | null; latencyMs: number };

export type Deps = {
  repo: CallsRepo;
  assess: (answers: Answers, ctx: { now: Date }) => Promise<AssessResult>;
  calcom: Calcom;
  telegram: Telegram;
  hubspot: Hubspot;
  now: () => Date;
  dashboardUrl: string;
  /** Runs work after the response is sent (Next's `after`). */
  defer: (fn: () => Promise<unknown>) => void;
};

type NextStep = "ask" | "offer_slots" | "end_call";
export type QualifyResponse = { route: Route; say: string; next_step: NextStep; ask_about: string | null };

async function findOrCreate(
  deps: Deps,
  meta: { vaaniCallId: string; callerNumber: string | null; startedAt: Date | null; answeredAt: Date | null },
): Promise<CallRecord> {
  const existing = await deps.repo.findByVaaniId(meta.vaaniCallId);
  if (existing) return existing;
  const startedAt = meta.startedAt ?? deps.now();
  return deps.repo.create({
    vaaniCallId: meta.vaaniCallId,
    callerNumber: meta.callerNumber,
    startedAt,
    answeredAt: meta.answeredAt ?? startedAt,
    afterHours: isAfterHours(startedAt),
  });
}

async function sendNote(deps: Deps, call: CallRecord): Promise<void> {
  const priorCalls = call.callerNumber ? await deps.repo.priorCalls(call.callerNumber, call.startedAt) : [];
  await deps.telegram.send(buildHandoffNote(call, { dashboardUrl: deps.dashboardUrl, priorCalls }));
  await deps.repo.update(call.id, { telegramSentAt: deps.now() });
}

function speak(d: Decision, a: Assessment | null): Pick<QualifyResponse, "say" | "next_step"> {
  switch (d.route) {
    case "qualified":
    case "qualified_flagged":
      return { say: LINES.qualified, next_step: "offer_slots" };
    case "ask":
      return { say: a?.suggested_question ?? ASK_FALLBACK[d.askAbout!] ?? LINES.callback, next_step: "ask" };
    case "close":
      return { say: CLOSE_LINES[d.closeReason!], next_step: "end_call" };
    case "escalate":
      return { say: LINES.escalate, next_step: "end_call" };
    default:
      return { say: LINES.callback, next_step: "end_call" };
  }
}

export async function handleQualify(raw: unknown, deps: Deps): Promise<QualifyResponse> {
  const req = parseQualifyRequest(raw);
  const call = await findOrCreate(deps, req);
  const answers: Answers = { ...call.answers, ...req.answers };

  let result: AssessResult | null = null;
  try {
    result = await deps.assess(answers, { now: deps.now() });
  } catch (err) {
    console.error("qualify: assessment failed, falling back to callback", err);
  }

  const decision: Decision = result
    ? decideRoute(result.assessment, { askCount: call.askCount })
    : { route: "callback", flags: [], closeReason: null, askAbout: null };

  const updated = await deps.repo.update(call.id, {
    callerNumber: call.callerNumber ?? req.callerNumber,
    answers,
    assessment: result?.assessment ?? call.assessment,
    route: decision.route,
    closeReason: decision.closeReason,
    flags: decision.flags,
    askCount: call.askCount + (decision.route === "ask" ? 1 : 0),
    aiCostUsd: (call.aiCostUsd ?? 0) + (result?.costUsd ?? 0),
    aiLatencyMs: result?.latencyMs ?? call.aiLatencyMs,
  });

  if (decision.route === "escalate" && !updated.telegramSentAt) {
    deps.defer(() => sendNote(deps, updated).catch((e) => console.error("qualify: urgent telegram failed", e)));
  }

  return { route: decision.route, ...speak(decision, result?.assessment ?? null), ask_about: decision.askAbout };
}

export async function handleSlots(raw: unknown, deps: Deps): Promise<{ slots: Slot[]; say: string }> {
  parseSlotsRequest(raw);
  const slots = await deps.calcom.slots(deps.now(), 3);
  return { slots, say: LINES.slots(slots.map((s) => s.label)) };
}

export async function handleBook(raw: unknown, deps: Deps): Promise<{ booked: boolean; say: string }> {
  const req = parseBookRequest(raw);
  const call = await deps.repo.findByVaaniId(req.vaaniCallId);
  if (!call || !isQualified(call.route)) return { booked: false, say: LINES.notQualifiedForBooking };

  const booking = await deps.calcom.book({
    start: req.slotStart,
    name: call.answers.name ?? req.name ?? "Caller",
    phone: call.callerNumber,
    notes: call.answers.scope ?? undefined,
  });
  const updated = await deps.repo.update(call.id, { bookingUid: booking.uid, bookingAt: booking.start });

  if (!updated.telegramSentAt) {
    deps.defer(() => sendNote(deps, updated).catch((e) => console.error("book: handoff telegram failed", e)));
  }
  return { booked: true, say: LINES.booked(formatSlot(booking.start)) };
}

const UNFINISHED: (Route | null)[] = [null, "ask"];

/** Post-call webhook. Finalises the row, sends any pending designer note, and syncs every call to HubSpot. */
export async function handleCallEnded(raw: unknown, deps: Deps): Promise<{ ok: boolean; errors: string[] }> {
  const req = parseCallEnded(raw);
  const call = await findOrCreate(deps, req);

  let final = await deps.repo.update(call.id, {
    callerNumber: call.callerNumber ?? req.callerNumber,
    endedAt: req.endedAt ?? deps.now(),
    durationSec: req.durationSec,
    voiceMinutes: req.voiceMinutes,
    transcript: req.transcript,
    ...(UNFINISHED.includes(call.route) ? { route: "dropped" as const } : {}),
  });

  const errors: string[] = [];
  const needsNote =
    !final.telegramSentAt &&
    (isQualified(final.route) || final.route === "escalate" || final.route === "callback" ||
      (final.route === "dropped" && final.callerNumber !== null));
  if (needsNote) {
    try {
      await sendNote(deps, final);
    } catch (e) {
      errors.push(`telegram: ${(e as Error).message}`);
    }
  }

  try {
    const ids = await deps.hubspot.syncCall(final);
    final = await deps.repo.update(final.id, {
      hubspotContactId: ids.contactId,
      hubspotCallId: ids.callId,
      hubspotDealId: ids.dealId,
      hubspotTaskId: ids.taskId,
    });
  } catch (e) {
    errors.push(`hubspot: ${(e as Error).message}`);
  }

  return { ok: errors.length === 0, errors };
}
