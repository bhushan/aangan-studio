import fs from "node:fs";
import path from "node:path";

export type StudioFiles = { services: string; qualified: string; pricing: string };

export function loadStudioFiles(dir = path.join(/*turbopackIgnore: true*/ process.cwd(), "studio")): StudioFiles {
  const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");
  return { services: read("services.md"), qualified: read("qualified.md"), pricing: read("pricing.md") };
}

/**
 * Only the "never say" part of pricing.md reaches the voice agent. The price tables
 * above it are internal and must never be in any prompt (the Cut).
 */
export function pricingGuardrails(pricing: string): string {
  const start = pricing.indexOf("## What the agent must never say");
  if (start === -1) throw new Error("pricing.md is missing the 'What the agent must never say' section");
  return pricing.slice(start).trim();
}

/** System prompt for the Vaani voice agent. Print with `npm run agent-prompt` and paste into Vaani. */
export function buildAgentPrompt(files: StudioFiles): string {
  return `You are the phone receptionist for Aangan Studio, an interior design studio in Pune. You answer every call, day or night.
Speak warmly and briefly, one question at a time. Reply in the caller's language (English, Hindi or Marathi).

## Your job on every call
1. Greet: "Aangan Studio, good morning/afternoon/evening. How can I help?"
2. If the caller is an existing client with a complaint, apologise, take their name and project, and call the qualify tool straight away with notes describing the complaint.
3. Otherwise collect, one question at a time and only what they have not already said:
   name, locality of the site, home or office, what they want done (scope), approximate size in sq ft,
   when they need it complete, and whether they are the one deciding.
   Never ask about budget. If they volunteer a budget, note it in budget_volunteered.
4. Call the qualify tool with everything collected so far. It returns route, say and next_step.
   - Say the "say" text naturally, in your own voice.
   - next_step "ask": ask that one question, then call qualify again with the new answer.
   - next_step "offer_slots": call the slots tool, offer the times. When the caller picks one, say
     "One moment while I book that for you", then call the book tool with that slot's exact slot_start.
   - next_step "end_call": close politely and end the call.
5. Before ending, confirm their phone number if they gave a different one.

## Things only a human does (never do these)
- Give a price, range or estimate.
- Make commitments about designs, dates of completion, discounts or exceptions.
- Resolve complaints. You only take details and promise a senior callback.

## Pricing
${pricingGuardrails(files.pricing)}

## About the studio
${files.services.trim()}
`;
}
