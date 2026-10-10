import { describe, expect, it } from "vitest";
import { createTelegram } from "./telegram";
import { fakeFetch } from "./fake-fetch";

describe("telegram.send", () => {
  it("posts plain text to the configured chat", async () => {
    const f = fakeFetch([{ method: "POST", match: "/sendMessage", json: { ok: true, result: { message_id: 7 } } }]);
    const tg = createTelegram({ token: "T", chatId: "-100", fetch: f.fetch });
    await tg.send("hello");
    expect(f.calls[0].url).toBe("https://api.telegram.org/botT/sendMessage");
    expect(f.calls[0].body).toEqual({ chat_id: "-100", text: "hello", link_preview_options: { is_disabled: true } });
  });

  it("throws when Telegram says not ok", async () => {
    const f = fakeFetch([{ method: "POST", match: "/sendMessage", status: 400, json: { ok: false, description: "chat not found" } }]);
    const tg = createTelegram({ token: "T", chatId: "-100", fetch: f.fetch });
    await expect(tg.send("x")).rejects.toThrow(/chat not found/);
  });
});
