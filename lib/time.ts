export const STUDIO_TZ = "Asia/Kolkata";
const OPEN_HOUR = 10;
const CLOSE_HOUR = 19;

function istHour(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: STUDIO_TZ, hour: "numeric", hourCycle: "h23" }).format(d));
}

/** Outside the front desk's 10am to 7pm (IST). */
export function isAfterHours(d: Date): boolean {
  const h = istHour(d);
  return h < OPEN_HOUR || h >= CLOSE_HOUR;
}

export function answeredWithin(startedAt: Date, answeredAt: Date | null, seconds: number): boolean {
  return answeredAt !== null && answeredAt.getTime() - startedAt.getTime() <= seconds * 1000;
}

/** "Fri 2 Oct, 11:00 am" in IST, for speech and notes. */
export function formatSlot(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: STUDIO_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}, ${get("hour")}:${get("minute")} ${get("dayPeriod").toLowerCase()}`;
}

/** Today's date in IST as YYYY-MM-DD, given to the model for timeline judgement. */
export function istDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: STUDIO_TZ }).format(d);
}
