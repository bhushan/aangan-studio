// Prints the Vaani agent system prompt. Paste the output into the Vaani agent settings.
import { buildAgentPrompt, loadStudioFiles } from "../lib/agent-prompt";

console.log(buildAgentPrompt(loadStudioFiles()));
