// Pushes the agent prompt to Vaani and checks the three custom tools, WITHOUT modifying them.
//   npx tsx scripts/vaani-tools.ts
//
// Never write persona.actions.functions through the API: Vaani keeps each tool's request-body template
// (built from the pasted cURL) where the API does not show it, and re-saving the tools wipes it. The
// tools then send an empty body. Tools are created and edited only in the dashboard (npm run tool).
import "./load-env";
import { buildAgentPrompt, loadStudioFiles, TOOL_NAMES } from "../lib/agent-prompt";
import { env } from "../lib/env";

const AGENT_ID = "de06fd53-a990-4e07-a1ae-d344e21f30bd";
const H = { "X-API-Key": env("VAANI_API_KEY"), "content-type": "application/json" };
const URL_ = `https://api.vaanivoice.ai/api/agent/${AGENT_ID}`;

type Fn = { function_name: string; agent_config?: { is_enabled?: boolean; params?: { api_endpoint?: string } }; function_params?: { properties?: Record<string, unknown>; required?: string[] } };

async function main() {
  const agent = await (await fetch(URL_, { headers: H })).json();
  const functions: Fn[] = agent.persona.actions.functions;

  for (const [key, name] of Object.entries(TOOL_NAMES)) {
    const f = functions.find((x) => x.function_name === name);
    if (!f) {
      console.log(`MISSING ${key}: no tool named "${name}". Re-paste it (npm run tool -- ${key}) and update TOOL_NAMES.`);
      continue;
    }
    const params = Object.keys(f.function_params?.properties ?? {});
    console.log(`${name}: ${f.agent_config?.is_enabled ? "on" : "OFF"}, ${f.agent_config?.params?.api_endpoint ?? "no endpoint"}, params [${params.join(", ")}], required [${f.function_params?.required ?? ""}]`);
  }
  const others = functions.filter((f) => !Object.values(TOOL_NAMES).includes(f.function_name as never));
  if (others.length) console.log(`other tools: ${others.map((f) => `${f.function_name} (${f.agent_config?.is_enabled ? "on" : "off"})`).join(", ")}`);

  const res = await fetch(`${URL_}/persona`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ identity: { system_prompt: buildAgentPrompt(loadStudioFiles()) } }),
  });
  if (!res.ok) throw new Error(`Vaani PATCH persona: ${res.status} ${(await res.text()).slice(0, 300)}`);
  console.log("prompt pushed (tools untouched)");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
