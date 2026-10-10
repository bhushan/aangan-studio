import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { StudioFiles } from "../agent-prompt";
import type { CloseReason, Route } from "../calls/types";
import { CLOSE_REASON } from "../labels";
import { istDate } from "../time";
import { buildRubricPrompt, DEFAULT_QUALIFY_MODEL, tokenCostUsd } from "./qualify";
import { answersSchema, assessmentSchema, type Answers, type Assessment } from "./schema";

// Post-call review: once Vaani sends the full transcript, re-read the whole conversation. It fills
// details the voice agent heard but never passed to /qualify, and re-checks the five criteria so a
// wrong mid-call outcome is caught before a designer acts on it. It never changes what the caller heard.

const s = (d: string) => z.string().nullable().describe(d);
const extractedSchema = z.object({
  name: s("Caller's name as they said it."),
  locality: s("Area or locality of the site, standard spelling (e.g. 'Nashik' for 'Nassik')."),
  property_type: z.enum(["home", "office", "other"]).nullable(),
  scope: s("What they want done."),
  size_sqft: z.number().nullable().describe("Approximate carpet area in sq ft, if said."),
  completion: s("When they need it complete, in their words."),
  decision_maker: s("Who decides, in their words."),
  budget_volunteered: s("Only a budget the caller volunteered."),
  notes: s("Anything else relevant, including complaint details."),
});

export type ReviewResult = { answers: Answers; assessment: Assessment; costUsd: number | null };

export function createReview(cfg: { files: StudioFiles; model?: string; timeoutMs?: number }) {
  return async (transcript: string, ctx: { now: Date }): Promise<ReviewResult> => {
    const model = cfg.model ?? DEFAULT_QUALIFY_MODEL;
    const result = await generateText({
      model: google(model),
      system: `${buildRubricPrompt(cfg.files, istDate(ctx.now))}

The call has ended. Read the whole transcript. First extract what the caller said (null for anything not said),
then judge the five criteria on the full conversation. Speech-to-text mangles words: read place names generously
("Nassik" is Nashik, "Baaner" is Baner) but never invent a detail the caller did not give.`,
      prompt: `Transcript:\n${transcript}`,
      output: Output.object({ schema: z.object({ answers: extractedSchema, assessment: assessmentSchema }) }),
      temperature: 0,
      maxRetries: 1,
      timeout: cfg.timeoutMs ?? 20_000,
    });
    // Same lenient parsing as the live tool, so a malformed field is dropped rather than failing the review.
    const answers: Answers = {};
    for (const [k, v] of Object.entries(result.output.answers)) {
      const parsed = answersSchema.shape[k as keyof Answers]?.safeParse(v);
      if (parsed?.success && parsed.data != null) Object.assign(answers, { [k]: parsed.data });
    }
    return { answers, assessment: result.output.assessment, costUsd: tokenCostUsd(model, result.usage) };
  };
}

/** What the agent captured stays; the transcript only fills the gaps. */
export function fillMissing(agent: Answers, extracted: Answers): { answers: Answers; filled: (keyof Answers)[] } {
  const answers: Answers = Object.fromEntries(Object.entries(agent).filter(([, v]) => v != null && v !== ""));
  const filled: (keyof Answers)[] = [];
  for (const [k, v] of Object.entries(extracted) as [keyof Answers, unknown][]) {
    if (v == null || v === "" || answers[k] != null) continue;
    Object.assign(answers, { [k]: v });
    filled.push(k);
  }
  return { answers, filled };
}

type Kind = "qualified" | "close" | "escalate" | "open";
const kind = (r: Route | null): Kind =>
  r === "qualified" || r === "qualified_flagged" ? "qualified" : r === "close" || r === "escalate" ? r : "open";

/** A one-line warning when the review contradicts the mid-call outcome; null when it agrees or cannot decide. */
export function reviewNote(mid: Route | null, review: { route: Route; closeReason: CloseReason | null }): string | null {
  const was = kind(mid);
  const now = kind(review.route);
  if (was === now || now === "open" || was === "escalate") return null;
  if (now === "escalate") return "Sounds like an existing-client complaint. Treat it as urgent.";
  const reason = review.closeReason ? CLOSE_REASON[review.closeReason] : "the criteria";
  if (now === "close") {
    return was === "qualified"
      ? `May not be a fit: ${reason}. Check before the consultation.`
      : `Likely not a fit: ${reason}. A callback may not be needed.`;
  }
  return was === "close" ? "Looks like a fit after all. Consider calling back." : "Looks qualified. Call back to book a consultation.";
}
