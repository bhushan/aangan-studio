import type { CallsRepo } from "./repo";
import type { CallRecord } from "./types";

// In-memory CallsRepo for tests.
export function createMemoryRepo(seed: CallRecord[] = []): CallsRepo & { all: () => CallRecord[] } {
  const rows = new Map(seed.map((c) => [c.id, structuredClone(c)]));
  let n = rows.size;
  const locks = new Set<string>();
  return {
    all: () => [...rows.values()],
    async findByVaaniId(v) {
      return [...rows.values()].find((c) => c.vaaniCallId === v) ?? null;
    },
    async findById(id) {
      return rows.get(id) ?? null;
    },
    async create(call) {
      const row: CallRecord = {
        id: `c_mem_${++n}`,
        endedAt: null,
        answers: {},
        assessment: null,
        route: null,
        closeReason: null,
        flags: [],
        askedAbout: [],
        bookingUid: null,
        bookingAt: null,
        hubspotContactId: null,
        hubspotCallId: null,
        hubspotDealId: null,
        hubspotTaskId: null,
        telegramSentAt: null,
        transcript: null,
        durationSec: null,
        voiceMinutes: null,
        aiCostUsd: null,
        aiLatencyMs: null,
        ...call,
      };
      rows.set(row.id, row);
      return row;
    },
    async update(id, patch) {
      const row = rows.get(id);
      if (!row) throw new Error(`no call ${id}`);
      const next = { ...row, ...patch };
      rows.set(id, next);
      return next;
    },
    async latestOpen(since) {
      return (
        [...rows.values()]
          .filter((c) => c.endedAt === null && c.startedAt >= since)
          .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0] ?? null
      );
    },
    async claimTelegram(id, at) {
      const row = rows.get(id)!;
      if (row.telegramSentAt) return false;
      rows.set(id, { ...row, telegramSentAt: at });
      return true;
    },
    async releaseTelegram(id) {
      rows.set(id, { ...rows.get(id)!, telegramSentAt: null });
    },
    async lockHubspot(id) {
      if (locks.has(id)) return false;
      locks.add(id);
      return true;
    },
    async unlockHubspot(id) {
      locks.delete(id);
    },
    async markDroppedIfUnfinished(id) {
      const row = rows.get(id)!;
      const next = row.route === null || row.route === "ask" ? { ...row, route: "dropped" as const } : row;
      rows.set(id, next);
      return next;
    },
    async list(since, limit) {
      return [...rows.values()]
        .filter((c) => !since || c.startedAt >= since)
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        .slice(0, limit);
    },
    async priorCalls(number, before) {
      return [...rows.values()]
        .filter((c) => c.callerNumber === number && c.startedAt < before)
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    },
  };
}
