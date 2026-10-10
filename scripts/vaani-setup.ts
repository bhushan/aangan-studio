// Configures the Vaani voice agent through the Vaani Backend API (https://docs.vaanivoice.ai).
//   npx tsx scripts/vaani-setup.ts                      list your agents
//   npx tsx scripts/vaani-setup.ts <agent_id>           push prompt + greeting, print tool cURLs and webhook URL
//   npx tsx scripts/vaani-setup.ts <agent_id> +91...    also route that inbound number to the agent
// Needs VAANI_API_KEY and APP_URL. Never prints secrets: tool cURLs use a <VAANI_TOOL_SECRET> placeholder.
import "./load-env";
import { buildAgentPrompt, loadStudioFiles } from "../lib/agent-prompt";
import { env } from "../lib/env";

const BASE = "https://api.vaanivoice.ai";
const headers = { "X-API-Key": env("VAANI_API_KEY"), "content-type": "application/json" };

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Vaani ${method} ${path}: ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  return json as Record<string, unknown>;
}

const GREETING = "Thank you for calling Aangan Studio. How can I help you today?";

function toolCurls(appUrl: string): string {
  const curl = (name: string, when: string, path: string, body: string) =>
    `### ${name}\nWhen to use: ${when}\n\ncurl -X POST ${appUrl}/api/vaani/${path} \\\n  -H "Content-Type: application/json" \\\n  -H "x-aangan-secret: <VAANI_TOOL_SECRET>" \\\n  -d '${body}'\n`;
  return [
    curl(
      "qualify",
      "After collecting the caller's details, and again after they answer a follow-up question. Also immediately for a complaint from an existing client (put the complaint in notes). Follow the returned say and next_step.",
      "qualify",
      '{"call_id":"{room_name}","name":"","locality":"","property_type":"home|office|other","scope":"","size_sqft":0,"completion":"","decision_maker":"","budget_volunteered":"","notes":""}',
    ),
    curl("slots", "When qualify returns next_step offer_slots. Offer the returned times.", "slots", '{"call_id":"{room_name}"}'),
    curl(
      "book",
      "When the caller picks one of the offered times. slot_start is the exact start value of the chosen slot.",
      "book",
      '{"call_id":"{room_name}","slot_start":"","name":""}',
    ),
  ].join("\n");
}

async function main() {
  const [agentId, inbound] = process.argv.slice(2);
  const appUrl = env("APP_URL").replace(/\/$/, "");

  if (!agentId) {
    const res = await api("GET", "/api/agents?page=1&page_size=50");
    const agents = (res.data ?? []) as { id: string; display_name: string; status: string; published: boolean }[];
    for (const a of agents) console.log(`${a.id}  ${a.display_name}  (${a.status}${a.published ? ", published" : ""})`);
    if (!agents.length) console.log("No agents yet. Create one in the Vaani dashboard (Agent Config -> New agent).");
    console.log("\nRun again with the agent_id to configure it.");
    return;
  }

  await api("PATCH", `/api/agent/${agentId}/persona`, {
    identity: {
      system_prompt: buildAgentPrompt(loadStudioFiles()),
      greeting_message: { agent_message: GREETING, agent_speech_delay: 0, interruptible: true, let_user_speak_first: false },
    },
    senses_capabilities: { language: "en", auto_detect: true },
  });
  console.log("persona updated: system prompt, greeting, language auto-detect (English/Hindi/Marathi)");

  if (inbound) {
    await api("PATCH", `/api/agent/${agentId}/deployment`, { deployment: { phone: { call_type: { Inbound: inbound } } } });
    console.log(`inbound calls on ${inbound} now route to this agent`);
  }

  console.log(`
Remaining dashboard steps (the API does not document custom tools or the account webhook):

1. Settings -> Webhooks, add:
   ${appUrl}/api/vaani/webhook?secret=<VAANI_TOOL_SECRET>

2. Agent -> Persona -> Tools: add these three cURL tools, replacing <VAANI_TOOL_SECRET> with your value.
   {room_name} asks Vaani to insert the call id; if it is not supported the app matches the open call instead.

${toolCurls(appUrl)}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
