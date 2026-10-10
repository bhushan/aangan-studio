export type Telegram = { send(text: string): Promise<void> };

export function createTelegram(cfg: { token: string; chatId: string; fetch?: typeof fetch }): Telegram {
  const f = cfg.fetch ?? fetch;
  return {
    async send(text) {
      const res = await f(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: cfg.chatId, text, link_preview_options: { is_disabled: true } }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
      if (!res.ok || !body.ok) throw new Error(`Telegram: ${body.description ?? res.status}`);
    },
  };
}
