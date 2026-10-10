// Splits the enquiries PDF into studio/transcripts/enquiries.json. Needs poppler's pdftotext.
// Usage: npx tsx scripts/extract-transcripts.ts
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const PDF = "seed-data/Aangan_Sep 2026_Enquiries.pdf";
const OUT = "studio/transcripts/enquiries.json";
const CHANNEL = { T: "phone", W: "whatsapp", F: "web_form" } as const;

const text = execFileSync("pdftotext", [PDF, "-"], { encoding: "utf8" });
const lines = text.replace(/\f/g, "\n").split("\n");
const items: { id: string; channel: string; header: string; text: string }[] = [];

for (const line of lines) {
  const m = line.match(/^([TWF])(\d{2}) · /);
  if (m) {
    items.push({ id: `${m[1]}${m[2]}`, channel: CHANNEL[m[1] as keyof typeof CHANNEL], header: line.trim(), text: "" });
  } else if (items.length && !/^SECTION \d/.test(line)) {
    items[items.length - 1].text += `${line}\n`;
  }
}
for (const it of items) {
  // Drop section intro paragraphs that follow the last item of a section.
  it.text = it.text.split(/\n(?:Messages received on|Submitted through)/)[0].replace(/\n{2,}/g, "\n").trim();
}

fs.writeFileSync(OUT, `${JSON.stringify(items, null, 2)}\n`);
console.log(`wrote ${items.length} enquiries to ${OUT}`);
