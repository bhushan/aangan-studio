// Rewrites the descriptions and parameters of the three custom tools Vaani created from our cURLs,
// and pushes the agent prompt. Vaani auto-generates misleading descriptions ("Book a Vaani session")
// and marks call_id required, which makes the agent invent one.  Usage: npx tsx scripts/vaani-tools.ts
import "./load-env";
import { buildAgentPrompt, loadStudioFiles, TOOL_NAMES } from "../lib/agent-prompt";
import { env } from "../lib/env";

const AGENT_ID = "de06fd53-a990-4e07-a1ae-d344e21f30bd";
const H = { "X-API-Key": env("VAANI_API_KEY"), "content-type": "application/json" };
const URL_ = `https://api.vaanivoice.ai/api/agent/${AGENT_ID}`;

const str = (description: string) => ({ type: "string", description });
const CALL_ID = str("Leave empty. The server identifies the call.");

const SPEC: Record<string, { description: string; properties: Record<string, unknown>; required: string[] }> = {
  [TOOL_NAMES.qualify]: {
    description:
      "Check an interior design enquiry against Aangan Studio's criteria. Call it once you have the caller's details (fill only what they said), again after they answer a follow-up question, and immediately for a complaint from an existing client (describe it in notes). Returns route, say (what to tell the caller) and next_step (ask, offer_slots or end_call).",
    properties: {
      call_id: CALL_ID,
      name: str("Caller's name."),
      locality: str("Area or locality of the site, e.g. Kothrud, Baner, Wakad."),
      property_type: { type: "string", enum: ["home", "office", "other"], description: "home, office or other." },
      scope: str("What they want done, e.g. 'full 3BHK redesign with execution', 'kitchen and two bedrooms'."),
      size_sqft: { type: "number", description: "Approximate carpet area in sq ft, if mentioned." },
      completion: str("When they need it complete, in their words, e.g. 'by March'."),
      decision_maker: str("Who decides, e.g. 'owner', 'owner with spouse', 'son researching for parents'."),
      budget_volunteered: str("Only if the caller volunteered a budget. Never ask for it."),
      notes: str("Anything else relevant, including complaint details."),
    },
    required: [],
  },
  [TOOL_NAMES.slots]: {
    description:
      "Get the next available design consultation slots. Call only when qualify returned next_step offer_slots. Offer the returned 'say' text; keep each slot's start value for booking.",
    properties: { call_id: CALL_ID },
    required: [],
  },
  [TOOL_NAMES.book]: {
    description:
      "Book the consultation slot the caller chose. Say 'One moment while I book that for you' first. Use the exact start value of the chosen slot from the slots result.",
    properties: {
      call_id: CALL_ID,
      slot_start: str("Exact start value of the chosen slot, as returned by the slots tool."),
      name: str("Caller's name."),
    },
    required: ["slot_start"],
  },
};

async function main() {
  const agent = await (await fetch(URL_, { headers: H })).json();
  const functions = agent.persona.actions.functions.map((f: { function_name: string; function_params: unknown }) => {
    const spec = SPEC[f.function_name];
    if (!spec) return f;
    return { ...f, description: spec.description, function_params: { type: "object", properties: spec.properties, required: spec.required } };
  });
  const missing = Object.keys(SPEC).filter((n) => !functions.some((f: { function_name: string }) => f.function_name === n));
  if (missing.length) throw new Error(`Tools not found on the agent: ${missing.join(", ")}`);

  const res = await fetch(`${URL_}/persona`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ identity: { system_prompt: buildAgentPrompt(loadStudioFiles()) }, actions: { functions } }),
  });
  if (!res.ok) throw new Error(`Vaani PATCH persona: ${res.status} ${(await res.text()).slice(0, 300)}`);

  const after = await (await fetch(URL_, { headers: H })).json();
  for (const f of after.persona.actions.functions) {
    const spec = SPEC[f.function_name];
    console.log(`${f.function_name}: ${f.agent_config?.is_enabled ? "on" : "off"}${spec ? `, description ${f.description === spec.description ? "updated" : "NOT updated"}, required [${f.function_params?.required ?? ""}]` : ""}`);
  }
  console.log(`prompt uses Vaani tool names: ${Object.values(TOOL_NAMES).every((n) => after.persona.identity.system_prompt.includes(n))}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
