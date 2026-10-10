const trim = (n: number) => String(Number(n.toFixed(1)));

/** Rupees the way the studio talks about them: ₹55, ₹12,345, ₹8L, ₹1.4Cr. */
export function formatInr(n: number): string {
  if (n >= 1e7) return `₹${trim(n / 1e7)}Cr`;
  if (n >= 1e5) return `₹${trim(n / 1e5)}L`;
  if (n >= 10 || n === 0) return `₹${Math.round(n).toLocaleString("en-IN")}`;
  return `₹${n.toFixed(2)}`;
}

export const formatPercent = (r: number | null) => (r === null ? "–" : `${Math.round(r * 100)}%`);

export function formatDuration(sec: number | null): string {
  if (sec === null) return "–";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (!m) return `${s}s`;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export const formatInrRange = (r: { low: number; high: number }) => `${formatInr(r.low)}–${formatInr(r.high).slice(1)}`;
