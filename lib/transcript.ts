export type Turn = { who: "agent" | "caller"; at: string | null; text: string };

const LINE = /^(?:\[([^\]]*)\]\s*)?(Agent|Caller)\s*:\s*(.*)$/;

const seconds = (ts: string | undefined) => {
  const m = ts && /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(ts);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
};

/**
 * Reads the "[ts] Agent: text" lines the Vaani adapter stores into turns for the chat view.
 * Vaani stamps lines with its own UTC clock, so times are shown as elapsed since the first line,
 * and it splits one breath into several lines, so a speaker's consecutive lines become one turn.
 */
export function parseTranscript(t: string | null): Turn[] {
  const turns: Turn[] = [];
  let start: number | null = null;
  for (const raw of (t ?? "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = LINE.exec(line);
    const last = turns.at(-1);
    if (!m) {
      if (last) last.text += ` ${line}`;
      else turns.push({ who: "caller", at: null, text: line });
      continue;
    }
    const who = m[2] === "Agent" ? "agent" : "caller";
    if (last?.who === who) {
      last.text += ` ${m[3]}`;
      continue;
    }
    const s = seconds(m[1]);
    if (s !== null) start ??= s;
    const d = s === null || start === null ? null : (s - start + 86400) % 86400; // calls can cross UTC midnight
    const at = d === null ? null : `${Math.floor(d / 60)}:${String(d % 60).padStart(2, "0")}`;
    turns.push({ who, at, text: m[3] });
  }
  return turns;
}
