import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { dashboardRepo, rates } from "@/lib/dashboard";
import { formatInr, formatInrRange, formatPercent } from "@/lib/format";
import { CLOSE_REASON, OUTCOME } from "@/lib/labels";
import {
  BASELINE_UNANSWERED_48H,
  computeMetrics,
  followUps,
  type Outcome,
  parseRange,
  PROJECT_VALUE_INR,
  RANGES,
  type RangeKey,
  rangeStart,
} from "@/lib/metrics";
import { CallList } from "./_components/call-row";
import { Badge, Card, Empty, PageHeader, Segmented, Skeleton, Stat } from "./_components/ui";

export const metadata: Metadata = { title: "Overview · Aangan Studio" };

export default function OverviewPage({ searchParams }: PageProps<"/">) {
  return (
    <>
      <PageHeader title="Overview" description="Every enquiry call the voice agent took, what came of it, and what it cost." />
      <Suspense fallback={<OverviewSkeleton />}>
        <Overview searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const rangeOptions = (Object.keys(RANGES) as RangeKey[]).map((key) => ({ key, label: RANGES[key] }));

async function Overview({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const range = parseRange((await searchParams).range);
  const repo = await dashboardRepo();
  const calls = await repo.list(rangeStart(range, new Date()), 2000);
  const r = rates();
  const m = computeMetrics(calls, r);
  const todo = followUps(calls);

  const rangeNav = <Segmented label="Time range" options={rangeOptions} current={range} href={(k) => (k === "30d" ? "/" : `/?range=${k}`)} />;

  if (!m.total) {
    return (
      <div className="space-y-4">
        {rangeNav}
        <Empty title={`No calls in the ${RANGES[range].toLowerCase()}`}>
          {range === "all" ? "Calls show up here as soon as the voice agent answers one." : <Link href="/?range=all" className="text-accent underline underline-offset-4">See all time</Link>}
        </Empty>
      </div>
    );
  }

  const baselineReplied = 1 - BASELINE_UNANSWERED_48H;
  const unbooked = m.qualified - calls.filter((c) => c.bookingUid && (c.route === "qualified" || c.route === "qualified_flagged")).length;

  return (
    <div className="space-y-6">
      {rangeNav}

      {/* The case for the agent in one card: speed of reply against the September baseline. */}
      <section className="rounded-xl border border-stone-200 bg-white p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <p className="text-sm font-medium text-accent">Reply speed</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
              {formatPercent(m.answeredIn5MinRate)}
              <span className="ml-2 align-middle text-lg font-normal text-stone-600">answered within 5 minutes</span>
            </p>
            <p className="mt-3 max-w-prose text-stone-600">
              {m.answeredIn5Min} of {m.total} callers spoke to the front desk straight away.{" "}
              {m.afterHours > 0 && (
                <>
                  <strong className="font-semibold text-stone-900">{m.afterHours}</strong> called outside 10am to 7pm, when nobody would
                  have picked up.
                </>
              )}
            </p>
          </div>
          <div className="space-y-4">
            <Bar label="Now: answered within 5 minutes" value={m.answeredIn5MinRate ?? 0} tone="accent" />
            <Bar label="Before (Sept 2026): replied within 48 hours" value={baselineReplied} tone="stone" />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Calls answered" value={m.total} hint={`${m.afterHours} after hours`} />
        <Stat label="Qualified" value={formatPercent(m.qualifiedRate)} hint={`${m.qualified} of ${m.total} calls`} />
        <Stat label="Consultations booked" value={m.booked} hint={unbooked > 0 ? `${unbooked} qualified, not yet booked` : "Every qualified caller booked"} />
        <Stat
          label="Pipeline booked"
          value={m.booked ? formatInrRange(m.pipelineInr) : "₹0"}
          hint={`At ${formatInrRange(PROJECT_VALUE_INR)} a project`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card
          title="Needs a person"
          action={todo.length > 0 && <Link href="/calls?view=follow_up" className="text-sm text-accent hover:underline">See all {todo.length}</Link>}
          className="overflow-hidden [&>div]:p-0"
        >
          {todo.length ? (
            <CallList calls={todo.slice(0, 6)} />
          ) : (
            <p className="px-5 py-8 text-center text-sm text-stone-600">Nothing waiting. Complaints, dropped calls and unbooked leads will show up here.</p>
          )}
        </Card>

        <Card title="Cost against value">
          <dl className="space-y-3 text-sm">
            <Row term="Spent" value={formatInr(m.cost.totalInr)} strong />
            <Row term={`Voice, ${m.cost.voiceMinutes} min at ₹${r.inrPerVoiceMinute}/min`} value={formatInr(m.cost.voiceInr)} sub />
            <Row term="AI qualification checks" value={formatInr(m.cost.aiInr)} sub />
            <div className="border-t border-stone-100 pt-3" />
            <Row term="Per call" value={m.cost.perCallInr === null ? "–" : formatInr(m.cost.perCallInr)} />
            <Row term="Per booked consultation" value={m.cost.perBookingInr === null ? "–" : formatInr(m.cost.perBookingInr)} />
            <div className="border-t border-stone-100 pt-3" />
            <Row term="Pipeline booked" value={m.booked ? formatInrRange(m.pipelineInr) : "₹0"} strong />
          </dl>
          {m.booked > 0 && m.cost.totalInr > 0 && (
            <p className="mt-4 rounded-lg bg-accent-soft px-3 py-2 text-sm text-stone-800">
              A single project from these bookings, at the low end, covers this spend{" "}
              {Math.max(1, Math.floor(PROJECT_VALUE_INR.low / m.cost.totalInr)).toLocaleString("en-IN")} times over.
            </p>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="How calls ended">
          <Breakdown
            rows={(Object.entries(m.outcomes) as [Outcome, number][])
              .sort((a, b) => b[1] - a[1])
              .map(([o, n]) => ({ label: <Badge tone={OUTCOME[o].tone}>{OUTCOME[o].label}</Badge>, n }))}
            total={m.total}
          />
        </Card>
        <Card title="Why callers weren't a fit">
          {m.closeReasons.length ? (
            <Breakdown rows={m.closeReasons.map((x) => ({ label: CLOSE_REASON[x.reason], n: x.count }))} total={m.closeReasons.reduce((s, x) => s + x.count, 0)} />
          ) : (
            <p className="text-sm text-stone-600">No caller has been turned away in this period.</p>
          )}
        </Card>
      </div>

      <p className="text-xs leading-relaxed text-stone-500">
        Pipeline values a booked consultation at a typical project of {formatInr(PROJECT_VALUE_INR.low)} to {formatInr(PROJECT_VALUE_INR.high)}, before
        conversion. Voice is costed at Vaani&apos;s self-serve ₹{r.inrPerVoiceMinute} a minute and AI at ₹{r.inrPerUsd} to the dollar. The
        baseline is the September 2026 enquiry audit: 48% of enquiries had no reply within 48 hours.
      </p>
    </div>
  );
}

function Bar({ label, value, tone }: { label: string; value: number; tone: "accent" | "stone" }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="text-stone-700">{label}</span>
        <span className="font-semibold tabular-nums text-stone-900">{formatPercent(value)}</span>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-stone-100" role="presentation">
        <div className={`h-full rounded-full ${tone === "accent" ? "bg-accent" : "bg-stone-400"}`} style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

function Row({ term, value, strong, sub }: { term: string; value: string; strong?: boolean; sub?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${sub ? "pl-3 text-stone-500" : "text-stone-700"}`}>
      <dt>{term}</dt>
      <dd className={`tabular-nums ${strong ? "text-base font-semibold text-stone-900" : ""}`}>{value}</dd>
    </div>
  );
}

function Breakdown({ rows, total }: { rows: { label: React.ReactNode; n: number }[]; total: number }) {
  return (
    <ul className="space-y-3">
      {rows.map((row, i) => (
        <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 text-sm">
          <span className="text-stone-700">{row.label}</span>
          <span className="tabular-nums text-stone-900">
            {row.n} <span className="text-stone-400">· {formatPercent(row.n / total)}</span>
          </span>
          <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-stone-100" role="presentation">
            <div className="h-full rounded-full bg-stone-400" style={{ width: `${(row.n / total) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading overview">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-44" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}
