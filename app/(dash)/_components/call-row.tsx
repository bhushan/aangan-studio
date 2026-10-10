import Link from "next/link";
import type { CallRecord } from "@/lib/calls/types";
import { CLOSE_REASON, OUTCOME } from "@/lib/labels";
import { formatSlot } from "@/lib/time";
import { Badge } from "./ui";

export function callerName(c: CallRecord): string {
  return c.answers.name ?? c.callerNumber ?? "Unknown caller";
}

const PROPERTY = { home: "Home", office: "Office", other: "Other" } as const;

/** "Baner · Home, 1,400 sq ft" from whatever the caller told us. */
export function projectLine(c: CallRecord): string {
  const a = c.answers;
  const kind = [a.property_type ? PROPERTY[a.property_type] : null, a.size_sqft ? `${a.size_sqft.toLocaleString("en-IN")} sq ft` : null]
    .filter(Boolean)
    .join(", ");
  return [a.locality, kind].filter(Boolean).join(" · ") || "No project details captured";
}

function detail(c: CallRecord): { text: string; className: string } | null {
  if (c.bookingAt) return { text: `Consultation ${formatSlot(c.bookingAt)}`, className: "text-emerald-800" };
  if (c.closeReason) return { text: CLOSE_REASON[c.closeReason], className: "text-stone-600" };
  return null;
}

export function CallRow({ call: c }: { call: CallRecord }) {
  const o = OUTCOME[c.route ?? "in_progress"];
  const d = detail(c);
  return (
    <li>
      <Link href={`/calls/${c.id}`} className="group flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-stone-50 sm:flex-row sm:items-center sm:gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="truncate font-medium text-stone-900 group-hover:underline group-hover:decoration-stone-300 group-hover:underline-offset-4">
              {callerName(c)}
            </p>
            <Badge tone={o.tone}>{o.label}</Badge>
          </div>
          <p className="mt-1 truncate text-sm text-stone-600">{projectLine(c)}</p>
          {d && <p className={`mt-0.5 text-sm ${d.className}`}>{d.text}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm text-stone-500 sm:flex-col sm:items-end sm:gap-0.5">
          <time dateTime={c.startedAt.toISOString()} className="tabular-nums">
            {formatSlot(c.startedAt)}
          </time>
          {c.afterHours && <span className="text-xs text-stone-500">After hours</span>}
        </div>
      </Link>
    </li>
  );
}

export function CallList({ calls }: { calls: CallRecord[] }) {
  return <ul className="divide-y divide-stone-100">{calls.map((c) => <CallRow key={c.id} call={c} />)}</ul>;
}
