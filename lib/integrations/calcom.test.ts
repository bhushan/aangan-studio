import { describe, expect, it } from "vitest";
import { createCalcom } from "./calcom";
import { fakeFetch } from "./fake-fetch";

const cfg = { apiKey: "K", eventTypeId: 42, attendeeEmail: "bookings@example.test" };

describe("calcom.slots", () => {
  it("returns the next few slots flattened and labelled in IST", async () => {
    const f = fakeFetch([
      {
        method: "GET",
        match: "/v2/slots",
        json: {
          status: "success",
          data: {
            "2026-10-02": [{ start: "2026-10-02T11:00:00.000+05:30" }, { start: "2026-10-02T15:00:00.000+05:30" }],
            "2026-10-03": [{ start: "2026-10-03T11:00:00.000+05:30" }],
          },
        },
      },
    ]);
    const cal = createCalcom({ ...cfg, fetch: f.fetch });
    const slots = await cal.slots(new Date("2026-10-01T17:00:00Z"), 2);
    expect(slots).toEqual([
      { start: "2026-10-02T05:30:00.000Z", label: "Fri 2 Oct, 11:00 am" },
      { start: "2026-10-02T09:30:00.000Z", label: "Fri 2 Oct, 3:00 pm" },
    ]);
    const url = new URL(f.calls[0].url);
    expect(url.searchParams.get("eventTypeId")).toBe("42");
    expect(url.searchParams.get("timeZone")).toBe("Asia/Kolkata");
    expect(f.calls[0].headers.get("cal-api-version")).toBe("2024-09-04");
    expect(f.calls[0].headers.get("authorization")).toBe("Bearer K");
  });
});

describe("calcom.book", () => {
  it("books with a plus-addressed studio email since callers give no email", async () => {
    const f = fakeFetch([
      { method: "POST", match: "/v2/bookings", json: { status: "success", data: { uid: "bk_1", start: "2026-10-02T05:30:00.000Z" } } },
    ]);
    const cal = createCalcom({ ...cfg, fetch: f.fetch });
    const b = await cal.book({ start: "2026-10-02T05:30:00.000Z", name: "Priya", phone: "+910000000001", notes: "3BHK Kothrud" });
    expect(b).toEqual({ uid: "bk_1", start: new Date("2026-10-02T05:30:00.000Z") });
    expect(f.calls[0].body).toMatchObject({
      start: "2026-10-02T05:30:00.000Z",
      eventTypeId: 42,
      attendee: { name: "Priya", email: "bookings+910000000001@example.test", timeZone: "Asia/Kolkata", phoneNumber: "+910000000001" },
      metadata: { notes: "3BHK Kothrud" },
    });
    expect(f.calls[0].headers.get("cal-api-version")).toBe("2026-02-25");
  });
});
