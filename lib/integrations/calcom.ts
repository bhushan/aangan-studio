import { formatSlot, STUDIO_TZ } from "../time";

const BASE = "https://api.cal.com/v2";

export type Slot = { start: string; label: string };
export type Calcom = {
  slots(from: Date, count: number): Promise<Slot[]>;
  book(input: { start: string; name: string; phone: string | null; notes?: string }): Promise<{ uid: string; start: Date }>;
};

/** Callers give no email on the phone, so bookings use the studio inbox plus-addressed by phone number. */
export function plusAddress(email: string, tag: string): string {
  const [local, domain] = email.split("@");
  return `${local}+${tag.replace(/\D/g, "") || "caller"}@${domain}`;
}

export function createCalcom(cfg: { apiKey: string; eventTypeId: number; attendeeEmail: string; fetch?: typeof fetch }): Calcom {
  const f = cfg.fetch ?? fetch;
  const auth = { authorization: `Bearer ${cfg.apiKey}` };

  return {
    async slots(from, count) {
      const end = new Date(from.getTime() + 7 * 24 * 3600 * 1000);
      const qs = new URLSearchParams({
        eventTypeId: String(cfg.eventTypeId),
        start: from.toISOString(),
        end: end.toISOString(),
        timeZone: STUDIO_TZ,
      });
      const res = await f(`${BASE}/slots?${qs}`, { headers: { ...auth, "cal-api-version": "2024-09-04" } });
      if (!res.ok) throw new Error(`Cal.com slots: ${res.status}`);
      const body = (await res.json()) as { data: Record<string, { start: string }[]> };
      return Object.values(body.data)
        .flat()
        .map((s) => new Date(s.start))
        .filter((d) => d > from)
        .sort((a, b) => a.getTime() - b.getTime())
        .slice(0, count)
        .map((d) => ({ start: d.toISOString(), label: formatSlot(d) }));
    },

    async book({ start, name, phone, notes }) {
      const res = await f(`${BASE}/bookings`, {
        method: "POST",
        headers: { ...auth, "cal-api-version": "2026-02-25", "content-type": "application/json" },
        body: JSON.stringify({
          start,
          eventTypeId: cfg.eventTypeId,
          attendee: {
            name,
            email: plusAddress(cfg.attendeeEmail, phone ?? ""),
            timeZone: STUDIO_TZ,
            ...(phone ? { phoneNumber: phone } : {}),
          },
          ...(notes ? { metadata: { notes: notes.slice(0, 500) } } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { data?: { uid: string; start: string }; error?: { message?: string } };
      if (!res.ok || !body.data) throw new Error(`Cal.com booking: ${body.error?.message ?? res.status}`);
      return { uid: body.data.uid, start: new Date(body.data.start) };
    },
  };
}
