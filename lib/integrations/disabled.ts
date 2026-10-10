import type { Calcom } from "./calcom";
import type { Hubspot } from "./hubspot";
import type { Telegram } from "./telegram";

// Stand-ins used until a service's keys are set, so calls still flow and the gap is visible.
const notConfigured = (name: string) => async (): Promise<never> => {
  throw new Error(`${name} not configured`);
};

export const disabledCalcom: Calcom = { slots: async () => [], book: notConfigured("Cal.com") };
export const disabledTelegram: Telegram = { send: notConfigured("Telegram") };
export const disabledHubspot: Hubspot = { syncCall: notConfigured("HubSpot") };
