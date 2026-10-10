import type { CallsRepo } from "../calls/repo";
import { isQualified, type CallRecord, type Route } from "../calls/types";
import { buildHandoffNote } from "../handoff-note";
import type { Calcom, Slot } from "../integrations/calcom";
import type { Hubspot, HubspotIds } from "../integrations/hubspot";
import type { Telegram } from "../integrations/telegram";
import { ASK_FALLBACK, CLOSE_LINES, LINES } from "../rubric/lines";
import { decideRoute, type Decision } from "../rubric/route";
import type { Answers, Assessment } from "../rubric/schema";
import { formatSlot, isAfterHours } from "../time";
import { randomUUID } from "node:crypto";
import { parseBookRequest, parseQualifyRequest, parseSlotsRequest, parseVaaniEvent, type VaaniEvent } from "../vaani/adapter";

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
  sleep: (ms: number) => Promise<void>;
};

type NextStep = "ask" | "offer_slots" | "end_call" | "resend_details";
export type QualifyResponse = { route: Route; say: string; next_step: NextStep; ask_about: string | null };

// A tool request without a call id belongs to the call in progress (Vaani's call_started creates it).
const OPEN_CALL_WINDOW_MS = 60 * 60 * 1000;

const openCall = (deps: Deps) => deps.repo.latestOpen(new Date(deps.now().getTime() - OPEN_CALL_WINDOW_MS));

/**
 * Webhook events carry Vaani's real room name. Tool calls may carry none, or one the agent made up
 * (Vaani marks call_id required), so for tools an unknown id falls back to the call in progress.
 */
async function findOrCreate(
  deps: Deps,
  meta: { vaaniCallId: string | null; callerNumber: string | null; startedAt: Date | null; answeredAt: Date | null },
  source: "webhook" | "tool" = "webhook",
): Promise<CallRecord> {
  const byId = meta.vaaniCallId ? await deps.repo.findByVaaniId(meta.vaaniCallId) : null;
  const existing = byId ?? (source === "tool" || !meta.vaaniCallId ? await openCall(deps) : null);
  if (existing) return existing;
  const startedAt = meta.startedAt ?? deps.now();
  return deps.repo.create({
    vaaniCallId: meta.vaaniCallId ?? `unlinked-${randomUUID()}`,
    callerNumber: meta.callerNumber,
    startedAt,
    answeredAt: meta.answeredAt, // set by Vaani's user_picked_up_at
    afterHours: isAfterHours(startedAt),
  });
}

/** Sends the designer note at most once per call, even when events overlap. */
async function sendNote(deps: Deps, call: CallRecord): Promise<void> {
  if (!(await deps.repo.claimTelegram(call.id, deps.now()))) return;
  try {
    const priorCalls = call.callerNumber ? await deps.repo.priorCalls(call.callerNumber, call.startedAt) : [];
    await deps.telegram.send(buildHandoffNote(call, { dashboardUrl: deps.dashboardUrl, priorCalls }));
  } catch (err) {
    await deps.repo.releaseTelegram(call.id); // let a later event retry
    throw err;
  }
}

function speak(d: Decision, question: string | null): Pick<QualifyResponse, "say" | "next_step"> {
  switch (d.route) {
    case "qualified":
    case "qualified_flagged":
      return { say: LINES.qualified, next_step: "offer_slots" };
    case "ask":
      return { say: question ?? ASK_FALLBACK[d.askAbout!] ?? LINES.callback, next_step: "ask" };
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
  const call = await findOrCreate(deps, req, "tool");
  const answers: Answers = { ...call.answers, ...req.answers };
  // Field names only, never values: shows what the voice agent actually passed.
  console.info(`qualify ${call.vaaniCallId}: received [${Object.keys(req.answers).join(", ")}]`);

  // An empty form would be judged "unclear" on everything and burn the follow-up questions.
  // Hand it back; the agent reads the reply and calls again with what the caller said.
  if (!Object.values(answers).some((v) => v != null && v !== "")) {
    return { route: call.route ?? "ask", say: "", next_step: "resend_details", ask_about: null };
  }

  let result: AssessResult | null = null;
  try {
    result = await deps.assess(answers, { now: deps.now() });
  } catch (err) {
    console.error("qualify: assessment failed, falling back to callback", err);
  }

  const decision: Decision = result
    ? decideRoute(result.assessment, { askedAbout: call.askedAbout })
    : { route: "callback", flags: [], closeReason: null, askAbout: null };

  const updated = await deps.repo.update(call.id, {
    callerNumber: call.callerNumber ?? req.callerNumber,
    answers,
    assessment: result?.assessment ?? call.assessment,
    route: decision.route,
    closeReason: decision.closeReason,
    flags: decision.flags,
    askedAbout: decision.askAbout ? [...call.askedAbout, decision.askAbout] : call.askedAbout,
    aiCostUsd: (call.aiCostUsd ?? 0) + (result?.costUsd ?? 0),
    aiLatencyMs: result?.latencyMs ?? call.aiLatencyMs,
  });

  if (decision.route === "escalate") {
    deps.defer(() => sendNote(deps, updated).catch((e) => console.error("qualify: urgent telegram failed", e)));
  }

  // The model phrases a question for the first unclear criterion; use it only when that is what we ask.
  const firstUnclear = result && decision.askAbout && call.askedAbout.length === 0 ? result.assessment.suggested_question : null;
  return { route: decision.route, ...speak(decision, firstUnclear), ask_about: decision.askAbout };
}

export async function handleSlots(raw: unknown, deps: Deps): Promise<{ slots: Slot[]; say: string }> {
  parseSlotsRequest(raw);
  let slots: Slot[] = [];
  try {
    slots = await deps.calcom.slots(deps.now(), 3);
  } catch (err) {
    // A stalled tool leaves the caller in silence; fall back to a designer callback instead.
    console.error("slots: Cal.com failed", err);
  }
  return { slots, say: LINES.slots(slots.map((s) => s.label)) };
}

export async function handleBook(raw: unknown, deps: Deps): Promise<{ booked: boolean; say: string }> {
  const req = parseBookRequest(raw);
  const call = (req.vaaniCallId ? await deps.repo.findByVaaniId(req.vaaniCallId) : null) ?? (await openCall(deps));
  if (!call || !isQualified(call.route)) return { booked: false, say: LINES.notQualifiedForBooking };
  if (call.bookingUid && call.bookingAt) return { booked: true, say: LINES.booked(formatSlot(call.bookingAt)) };

  let booking: { uid: string; start: Date };
  try {
    booking = await deps.calcom.book({
      start: req.slotStart,
      name: call.answers.name ?? req.name ?? "Caller",
      phone: call.callerNumber,
      notes: call.answers.scope ?? undefined,
    });
  } catch (err) {
    // The call stays qualified, so call_ended still sends designers a "not booked yet" note.
    console.error("book: Cal.com failed", err);
    return { booked: false, say: LINES.bookingFailed };
  }
  const updated = await deps.repo.update(call.id, { bookingUid: booking.uid, bookingAt: booking.start });

  deps.defer(() => sendNote(deps, updated).catch((e) => console.error("book: handoff telegram failed", e)));
  return { booked: true, say: LINES.booked(formatSlot(booking.start)) };
}

type WebhookResult = { ok: boolean; errors: string[] };

/** Vaani's account webhook. One URL receives every call lifecycle event. */
const HANDLED_EVENTS = new Set(["call_started", "user_picked_up_at", "call_ended", "call_postprocessing"]);

export async function handleWebhook(raw: unknown, deps: Deps): Promise<WebhookResult> {
  // Connectivity tests and events we do not use are acknowledged before any validation.
  const name = (raw as { event?: unknown } | null)?.event;
  if (typeof name !== "string" || !HANDLED_EVENTS.has(name)) return { ok: true, errors: [] };
  const ev = parseVaaniEvent(raw);
  const meta = { vaaniCallId: ev.vaaniCallId, callerNumber: ev.callerNumber, startedAt: ev.at, answeredAt: null };
  switch (ev.event) {
    case "call_started": {
      const call = await findOrCreate(deps, meta);
      if (!call.callerNumber && ev.callerNumber) await deps.repo.update(call.id, { callerNumber: ev.callerNumber });
      return { ok: true, errors: [] };
    }
    case "user_picked_up_at": {
      const call = await findOrCreate(deps, meta);
      if (!call.answeredAt) await deps.repo.update(call.id, { answeredAt: ev.at ?? deps.now() });
      return { ok: true, errors: [] };
    }
    case "call_ended":
    case "call_postprocessing":
      return finalize(ev, deps);
    default:
      return { ok: true, errors: [] };
  }
}

const HUBSPOT_LEASE_MS = 30_000;
const HUBSPOT_LOCK_RETRY_MS = 3_000;

/**
 * Runs on call_ended and again on call_postprocessing (which brings the transcript).
 * Sends any pending designer note once, and syncs every call to HubSpot (idempotent updates).
 */
async function finalize(ev: VaaniEvent, deps: Deps): Promise<WebhookResult> {
  const call = await findOrCreate(deps, { vaaniCallId: ev.vaaniCallId, callerNumber: ev.callerNumber, startedAt: null, answeredAt: null });

  await deps.repo.update(call.id, {
    callerNumber: call.callerNumber ?? ev.callerNumber,
    endedAt: call.endedAt ?? deps.now(),
    ...(ev.durationSec !== null ? { durationSec: ev.durationSec, voiceMinutes: ev.voiceMinutes } : {}),
    ...(ev.transcript ? { transcript: ev.transcript } : {}),
  });
  // Atomic, so a qualify that lands as the caller hangs up is not overwritten.
  const final = await deps.repo.markDroppedIfUnfinished(call.id);

  const errors: string[] = [];
  const needsNote =
    isQualified(final.route) || final.route === "escalate" || final.route === "callback" ||
    (final.route === "dropped" && final.callerNumber !== null);
  if (needsNote && !final.telegramSentAt) {
    try {
      await sendNote(deps, final);
    } catch (e) {
      errors.push(`telegram: ${(e as Error).message}`);
    }
  }

  const hubspotError = await syncHubspot(deps, final.id);
  if (hubspotError) errors.push(`hubspot: ${hubspotError}`);
  return { ok: errors.length === 0, errors };
}

/**
 * One HubSpot sync per call at a time. The lease holder re-syncs once if the call changed
 * while it was syncing (e.g. call_postprocessing added the transcript), so nothing is lost.
 */
async function syncHubspot(deps: Deps, id: string): Promise<string | null> {
  let locked = await deps.repo.lockHubspot(id, HUBSPOT_LEASE_MS);
  if (!locked) {
    await deps.sleep(HUBSPOT_LOCK_RETRY_MS);
    locked = await deps.repo.lockHubspot(id, HUBSPOT_LEASE_MS);
    if (!locked) return null; // the holder re-syncs if this event changed anything
  }
  const save = async (ids: Partial<HubspotIds>) => {
    await deps.repo.update(id, {
      ...(ids.contactId !== undefined ? { hubspotContactId: ids.contactId } : {}),
      ...(ids.callId !== undefined ? { hubspotCallId: ids.callId } : {}),
      ...(ids.dealId !== undefined ? { hubspotDealId: ids.dealId } : {}),
      ...(ids.taskId !== undefined ? { hubspotTaskId: ids.taskId } : {}),
    });
  };
  try {
    for (let pass = 0; pass < 2; pass++) {
      const snapshot = (await deps.repo.findById(id))!;
      const ids = await deps.hubspot.syncCall(snapshot, save);
      await save(ids);
      const after = (await deps.repo.findById(id))!;
      const changed =
        after.transcript !== snapshot.transcript || after.route !== snapshot.route || after.bookingUid !== snapshot.bookingUid;
      if (!changed) break;
    }
    return null;
  } catch (e) {
    return (e as Error).message;
  } finally {
    await deps.repo.unlockHubspot(id);
  }
}
