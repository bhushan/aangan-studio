import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import type { StudioFiles } from "../agent-prompt";
import type { AssessResult } from "../handlers";
import { istDate } from "../time";
import { assessmentSchema, type Answers } from "./schema";

// Called directly with the studio's Gemini API key (GOOGLE_GENERATIVE_AI_API_KEY).
// Flash-Lite: same 39/39 eval score as Flash at under half the latency (Vaani allows a tool 2-3 s).
export const DEFAULT_QUALIFY_MODEL = "gemini-3.5-flash-lite";

// List prices, USD per million tokens (checked Oct 2026). Output includes reasoning tokens.
const PRICE_PER_M: Record<string, { input: number; output: number }> = {
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-3.8-flash": { input: 0.75, output: 3.75 }, // introductory through Dec 2026
};

export function tokenCostUsd(
  model: string,
  usage: { inputTokens: number | undefined; outputTokens: number | undefined },
): number | null {
  const price = PRICE_PER_M[model];
  if (!price || (usage.inputTokens === undefined && usage.outputTokens === undefined)) return null;
  return ((usage.inputTokens ?? 0) * price.input + (usage.outputTokens ?? 0) * price.output) / 1_000_000;
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

    const model = cfg.model ?? DEFAULT_QUALIFY_MODEL;
    const result = await generateText({
      model: google(model),
      system: buildRubricPrompt(cfg.files, istDate(ctx.now)),
      prompt: parts.join("\n\n"),
      output: Output.object({ schema: assessmentSchema }),
      temperature: 0,
      maxRetries: 0,
      // Vaani expects a tool reply within 2-3 s; leave room for the database writes.
      timeout: cfg.timeoutMs ?? 2000,
    });
    return {
      assessment: result.output,
      costUsd: tokenCostUsd(model, result.usage),
      latencyMs: Date.now() - started,
    };
  };
}
