import { describe, expect, it } from "vitest";
import { disabledCalcom, disabledHubspot, disabledTelegram } from "./disabled";
import { makeCall } from "../calls/fixtures";

describe("unconfigured integrations", () => {
  it("Cal.com offers no slots, so the agent promises a designer callback", async () => {
    expect(await disabledCalcom.slots(new Date(), 3)).toEqual([]);
    await expect(disabledCalcom.book({ start: "", name: "", phone: null })).rejects.toThrow(/Cal.com not configured/);
  });
  it("Telegram and HubSpot fail loudly so the call records what was skipped", async () => {
    await expect(disabledTelegram.send("x")).rejects.toThrow(/Telegram not configured/);
    await expect(disabledHubspot.syncCall(makeCall())).rejects.toThrow(/HubSpot not configured/);
  });
});
