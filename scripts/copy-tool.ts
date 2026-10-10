// Copies one Vaani tool's ready-to-paste cURL (secret included) to the macOS clipboard.
// Usage: npm run tool -- qualify|slots|book     Prints the tool name and description; never the secret.
import "./load-env";
import { execFileSync } from "node:child_process";
import { env } from "../lib/env";

const APP = env("APP_URL").replace(/\/$/, "");
const TOOLS: Record<string, { description: string; body: string }> = {
  qualify: {
    description:
      "After collecting the caller's details, and again after they answer a follow-up question. Also immediately for a complaint from an existing client (put the complaint in notes). Follow the returned say and next_step.",
    body: '{"call_id":"{room_name}","name":"","locality":"","property_type":"home|office|other","scope":"","size_sqft":0,"completion":"","decision_maker":"","budget_volunteered":"","notes":""}',
  },
  slots: {
    description: "When qualify returns next_step offer_slots. Offer the returned times.",
    body: '{"call_id":"{room_name}"}',
  },
  book: {
    description:
      "When the caller picks one of the offered times. Say 'One moment while I book that for you' first. slot_start is the exact start value of the chosen slot.",
    body: '{"call_id":"{room_name}","slot_start":"","name":""}',
  },
};

const name = process.argv[2];
const tool = TOOLS[name];
if (!tool) {
  console.error(`Usage: npm run tool -- ${Object.keys(TOOLS).join("|")}`);
  process.exit(1);
}
const curl = `curl -X POST ${APP}/api/vaani/${name} \\
  -H "Content-Type: application/json" \\
  -H "x-aangan-secret: ${env("VAANI_TOOL_SECRET")}" \\
  -d '${tool.body}'`;
execFileSync("pbcopy", { input: curl });
console.log(`Copied the "${name}" cURL to your clipboard (secret included).\n\nTool name: ${name}\nDescription: ${tool.description}`);
