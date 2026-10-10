import type { CallRecord } from "./types";

export type NewCall = Pick<CallRecord, "vaaniCallId" | "callerNumber" | "startedAt" | "answeredAt" | "afterHours">;
export type CallPatch = Partial<Omit<CallRecord, "id" | "vaaniCallId">>;

export interface CallsRepo {
  findByVaaniId(vaaniCallId: string): Promise<CallRecord | null>;
  findById(id: string): Promise<CallRecord | null>;
  create(call: NewCall): Promise<CallRecord>;
  update(id: string, patch: CallPatch): Promise<CallRecord>;
  /** Earlier calls from the same number, newest first. */
  priorCalls(callerNumber: string, beforeStartedAt: Date): Promise<CallRecord[]>;
}
