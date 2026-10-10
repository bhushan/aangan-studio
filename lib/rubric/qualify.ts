import { generateText, Output } from "ai";
import type { StudioFiles } from "../agent-prompt";
import type { AssessResult } from "../handlers";
import { istDate } from "../time";
import { assessmentSchema, type Answers } from "./schema";

export const DEFAULT_QUALIFY_MODEL = "google/gemini-3.8-flash";

export function buildRubricPrompt(files: Pick<StudioFiles, "services" | "qualified">, today: string): string {
  return `You check phone enquiries for Aangan Studio, an interior design studio, against the founder's rubric.
Judge each of the five criteria as pass, fail or unclear, using only what the caller actually said.
Do not route the call yourself; just judge. Today is ${today} (Asia/Kolkata).

Rules of thumb:
- Unknown or not yet discussed means "unclear", except budget: not mentioned means "pass".
- Asking about price never fails anything.
- Renting is fine if no structural work is needed.
- A specific Pune or PCMC locality passes service_area even if it is not in the list; a place outside Pune fails.
- A complaint about an ongoing project from an existing client sets is_complaint true.

# Founder's rubric (qualified.md)
${files.qualified.trim()}

# What the studio does (services.md)
${files.services.trim()}`;
}

function gatewayCost(meta: unknown): number | null {
  const g = (meta as { gateway?: Record<string, unknown> } | undefined)?.gateway;
  const v = Number(g?.cost ?? g?.marketCost ?? g?.totalCost);
  return Number.isFinite(v) ? v : null;
}

export function createAssess(cfg: { files: StudioFiles; model?: string; timeoutMs?: number }) {
  return async (answers: Answers, ctx: { now: Date; transcript?: string }): Promise<AssessResult> => {
    const started = Date.now();
    const parts = [`Answers collected so far (JSON):\n${JSON.stringify(answers, null, 2)}`];
    if (ctx.transcript) parts.push(`Conversation:\n${ctx.transcript}`);

    const result = await generateText({
      model: cfg.model ?? DEFAULT_QUALIFY_MODEL,
      system: buildRubricPrompt(cfg.files, istDate(ctx.now)),
      prompt: parts.join("\n\n"),
      output: Output.object({ schema: assessmentSchema }),
      temperature: 0,
      maxRetries: 0,
      timeout: cfg.timeoutMs ?? 2500,
    });
    return {
      assessment: result.output,
      costUsd: gatewayCost(result.providerMetadata),
      latencyMs: Date.now() - started,
    };
  };
}
