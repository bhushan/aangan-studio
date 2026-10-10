import { after } from "next/server";
import { loadStudioFiles } from "./agent-prompt";
import { createNeonRepo } from "./calls/neon-repo";
import { env, optionalEnv } from "./env";
import type { Deps } from "./handlers";
import { createCalcom } from "./integrations/calcom";
import { createHubspot } from "./integrations/hubspot";
import { createTelegram } from "./integrations/telegram";
import { createAssess } from "./rubric/qualify";

let cached: Deps | null = null;

/** Production wiring for the /api/vaani/* handlers. */
export function getDeps(): Deps {
  if (cached) return cached;
  env("GOOGLE_GENERATIVE_AI_API_KEY"); // read by @ai-sdk/google; checked here so a missing key fails loudly
  const dashboardUrl = env("APP_URL").replace(/\/$/, "");
  const assess = createAssess({ files: loadStudioFiles(), model: optionalEnv("QUALIFY_MODEL") });
  cached = {
    repo: createNeonRepo(env("DATABASE_URL")),
    assess: (answers, ctx) => assess(answers, ctx),
    calcom: createCalcom({
      apiKey: env("CALCOM_API_KEY"),
      eventTypeId: Number(env("CALCOM_EVENT_TYPE_ID")),
      attendeeEmail: env("CALCOM_ATTENDEE_EMAIL"),
    }),
    telegram: createTelegram({ token: env("TELEGRAM_BOT_TOKEN"), chatId: env("TELEGRAM_CHAT_ID") }),
    hubspot: createHubspot({
      token: env("HUBSPOT_TOKEN"),
      pipelineId: env("HUBSPOT_PIPELINE_ID"),
      dealStageId: env("HUBSPOT_DEAL_STAGE_ID"),
      ownerId: env("HUBSPOT_OWNER_ID"),
      dashboardUrl,
    }),
    now: () => new Date(),
    dashboardUrl,
    defer: (fn) => after(fn),
  };
  return cached;
}
