import type { CallRecord } from "./types";

export type NewCall = Pick<CallRecord, "vaaniCallId" | "callerNumber" | "startedAt" | "answeredAt" | "afterHours">;
export type CallPatch = Partial<Omit<CallRecord, "id" | "vaaniCallId">>;

export interface CallsRepo {
  findByVaaniId(vaaniCallId: string): Promise<CallRecord | null>;
  findById(id: string): Promise<CallRecord | null>;
  create(call: NewCall): Promise<CallRecord>;
  update(id: string, patch: CallPatch): Promise<CallRecord>;
  /** Most recent call that started after `since` and has not ended. Used when a tool omits the call id. */
  latestOpen(since: Date): Promise<CallRecord | null>;
  /** Atomically marks the designer note as sent. False if another event already claimed it. */
  claimTelegram(id: string, at: Date): Promise<boolean>;
  /** Undo a claim when sending failed, so a later event can retry. */
  releaseTelegram(id: string): Promise<void>;
  /** Leases the HubSpot sync for `ms`. False while another event holds it. */
  lockHubspot(id: string, ms: number): Promise<boolean>;
  unlockHubspot(id: string): Promise<void>;
  /** Sets route to "dropped" only if no decision was reached (route null or "ask"), atomically. */
  markDroppedIfUnfinished(id: string): Promise<CallRecord>;
  /** Calls started at or after `since` (all when null), newest first. For the dashboard. */
  list(since: Date | null, limit: number): Promise<CallRecord[]>;
  /** Earlier calls from the same number, newest first. */
  priorCalls(callerNumber: string, beforeStartedAt: Date): Promise<CallRecord[]>;
}
