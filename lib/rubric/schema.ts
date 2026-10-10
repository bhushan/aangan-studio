import { z } from "zod";

// Nikhil's five criteria, in the order of qualified.md.
export const CRITERIA = ["real_project", "service_area", "timeline", "budget", "decision_maker"] as const;
export type CriterionKey = (typeof CRITERIA)[number];

export const verdictSchema = z.enum(["pass", "fail", "unclear"]);
export type Verdict = z.infer<typeof verdictSchema>;

const criterionSchema = z.object({
  verdict: verdictSchema,
  evidence: z.string().describe("Short quote or paraphrase from the caller that supports the verdict; empty if nothing was said."),
});

export const assessmentSchema = z.object({
  criteria: z.object({
    real_project: criterionSchema.describe("Wants design AND execution, at least one full room, and within the studio's scope (not advice-only, not restaurants/retail/hotels/gyms, not offices under 500 sq ft)."),
    service_area: criterionSchema.describe("Site is in Pune city or PCMC."),
    timeline: criterionSchema.describe("Completion date leaves enough time: fail if they need it finished in under 8 weeks from today."),
    budget: criterionSchema.describe("Only judged if the caller volunteered a number. Volunteered and clearly too low for the scope = fail. Not mentioned = pass."),
    decision_maker: criterionSchema.describe("Caller decides, or is authorised by the decider. Just researching for someone else without authority = unclear."),
  }),
  is_complaint: z.boolean().describe("True if this is an existing client complaining about an ongoing project, not a new enquiry."),
  suggested_question: z
    .string()
    .nullable()
    .describe("If a criterion among real_project, service_area, timeline is unclear: the one short, polite question to ask about the first unclear one. Otherwise null."),
});
export type Assessment = z.infer<typeof assessmentSchema>;

// What the voice agent collects. Every field is optional because qualify is called mid-call.
export const answersSchema = z.object({
  name: z.string().nullish(),
  locality: z.string().nullish(),
  property_type: z.enum(["home", "office", "other"]).nullish(),
  scope: z.string().nullish(),
  size_sqft: z.preprocess(
    (v) => (typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) || null : v),
    z.number().positive().nullish(),
  ),
  completion: z.string().nullish(),
  decision_maker: z.string().nullish(),
  budget_volunteered: z.string().nullish(),
  notes: z.string().nullish(),
});
export type Answers = z.infer<typeof answersSchema>;
