import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import type { StudioFiles } from "../agent-prompt";
import type { AssessResult } from "../handlers";
import { istDate } from "../time";
import { assessmentSchema, type Answers } from "./schema";

// Called directly with the studio's Gemini API key (GOOGLE_GENERATIVE_AI_API_KEY).
export const DEFAULT_QUALIFY_MODEL = "gemini-3.8-flash";

// Gemini 3.8 Flash list price, USD per million tokens (introductory rate through Dec 2026;
// $1.50 / $7.50 from Jan 2027). Output includes reasoning tokens.
const PRICE_PER_M = { input: 0.75, output: 3.75 };

export function tokenCostUsd(usage: { inputTokens: number | undefined; outputTokens: number | undefined }): number | null {
  if (usage.inputTokens === undefined && usage.outputTokens === undefined) return null;
  return ((usage.inputTokens ?? 0) * PRICE_PER_M.input + (usage.outputTokens ?? 0) * PRICE_PER_M.output) / 1_000_000;
}

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

export function createAssess(cfg: { files: StudioFiles; model?: string; timeoutMs?: number }) {
  return async (answers: Answers, ctx: { now: Date; transcript?: string }): Promise<AssessResult> => {
    const started = Date.now();
    const parts = [`Answers collected so far (JSON):\n${JSON.stringify(answers, null, 2)}`];
    if (ctx.transcript) parts.push(`Conversation:\n${ctx.transcript}`);

    const result = await generateText({
      model: google(cfg.model ?? DEFAULT_QUALIFY_MODEL),
      system: buildRubricPrompt(cfg.files, istDate(ctx.now)),
      prompt: parts.join("\n\n"),
      output: Output.object({ schema: assessmentSchema }),
      temperature: 0,
      maxRetries: 0,
      // Vaani expects a tool reply within 2-3 s; leave room for the database writes.
      timeout: cfg.timeoutMs ?? 2000,
      // Minimal thinking keeps a mid-call check fast; the rubric is a classification, not a puzzle.
      providerOptions: { google: { thinkingConfig: { thinkingLevel: "minimal" } } },
    });
    return {
      assessment: result.output,
      costUsd: tokenCostUsd(result.usage),
      latencyMs: Date.now() - started,
    };
  };
}
