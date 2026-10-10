import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { CallRecord } from "@/lib/calls/types";
import { dashboardRepo, hubspotLink, rates } from "@/lib/dashboard";
import { formatDuration, formatInr } from "@/lib/format";
import { CLOSE_REASON, CRITERION, NEXT_STEP, OUTCOME, VERDICT } from "@/lib/labels";
import { CRITERIA } from "@/lib/rubric/schema";
import { formatSlot } from "@/lib/time";
import { parseTranscript } from "@/lib/transcript";
import { callerName, projectLine } from "../../_components/call-row";
import { Badge, Card, Skeleton } from "../../_components/ui";

export const metadata: Metadata = { title: "Call · Aangan Studio" };

export default function CallPage({ params }: PageProps<"/calls/[id]">) {
  return (
    <>
      <Link href="/calls" className="mb-4 inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900">
        <span aria-hidden>←</span> All calls
      </Link>
      <Suspense fallback={<DetailSkeleton />}>
        <CallDetail params={params} />
      </Suspense>
    </>
  );
}

async function CallDetail({ params }: { params: PageProps<"/calls/[id]">["params"] }) {
  const { id } = await params;
  const repo = await dashboardRepo();
  // Links from Telegram and HubSpot use the row id; the Vaani room name works too.
  const c = (await repo.findById(id)) ?? (await repo.findByVaaniId(decodeURIComponent(id)));
  if (!c) notFound();
  const prior = c.callerNumber ? await repo.priorCalls(c.callerNumber, c.startedAt) : [];
  const outcome = OUTCOME[c.route ?? "in_progress"];
  const next = !c.bookingUid ? NEXT_STEP[c.route ?? "in_progress"] : undefined;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{callerName(c)}</h1>
            <Badge tone={outcome.tone}>{outcome.label}</Badge>
          </div>
          <p className="mt-1 text-stone-600">{projectLine(c)}</p>
          <p className="mt-1 text-sm text-stone-500">
            Called {formatSlot(c.startedAt)}
            {c.afterHours && " · after hours"}
            {c.durationSec !== null && ` · ${formatDuration(c.durationSec)}`}
          </p>
        </div>
        {c.callerNumber && (
          <a
            href={`tel:${c.callerNumber}`}
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-800"
          >
            Call {c.callerNumber}
          </a>
        )}
      </header>

      {c.bookingAt && (
        <Callout tone="good" title={`Consultation booked for ${formatSlot(c.bookingAt)}`}>
          {c.flags.length > 0 && `Before the meeting, confirm: ${c.flags.map((f) => CRITERION[f].toLowerCase()).join(", ")}.`}
        </Callout>
      )}
      {next && (
        <Callout tone={c.route === "escalate" ? "bad" : "warn"} title="Next step">
          {next}
          {!c.callerNumber && " No number was captured on this call, so check HubSpot or the transcript for a way back."}
        </Callout>
      )}
      {c.closeReason && <Callout tone="muted" title={`Not a fit: ${CLOSE_REASON[c.closeReason]}`}>The agent explained this to the caller and closed politely.</Callout>}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0 space-y-6">
          <Card title="What the caller told us">
            <Answers call={c} />
          </Card>
          <Card title="The five checks">
            {c.assessment ? (
              <ul className="divide-y divide-stone-100">
                {CRITERIA.map((k) => {
                  const { verdict, evidence } = c.assessment!.criteria[k];
                  const v = VERDICT[verdict];
                  return (
                    <li key={k} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:gap-4">
                      <div className="flex shrink-0 items-center justify-between gap-3 sm:w-56">
                        <span className="text-sm font-medium text-stone-800">{CRITERION[k]}</span>
                        <Badge tone={v.tone}>{v.label}</Badge>
                      </div>
                      <p className="text-sm text-stone-600">{evidence ? <q className="italic">{evidence}</q> : <span className="text-stone-400">Nothing said</span>}</p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-stone-600">The call ended before the agent ran the check.</p>
            )}
          </Card>
          <Card title="Transcript">
            <Transcript text={c.transcript} />
          </Card>
        </div>

        <aside className="space-y-6">
          <Card title="Records">
            <dl className="space-y-2.5 text-sm">
              <Fact term="HubSpot contact" value={<RecordLink href={hubspotLink("contact", c.hubspotContactId)} id={c.hubspotContactId} />} />
              <Fact term="HubSpot deal" value={<RecordLink href={hubspotLink("deal", c.hubspotDealId)} id={c.hubspotDealId} />} />
              <Fact term="Designer note" value={c.telegramSentAt ? `Sent ${formatSlot(c.telegramSentAt)}` : "Not sent"} />
              <Fact term="Cal.com booking" value={c.bookingUid ? "Booked" : "None"} />
            </dl>
          </Card>
          <Card title="Call details">
            <dl className="space-y-2.5 text-sm">
              <Fact term="Answered" value={c.answeredAt ? `${Math.max(0, Math.round((c.answeredAt.getTime() - c.startedAt.getTime()) / 1000))}s after ringing` : "–"} />
              <Fact term="Length" value={formatDuration(c.durationSec)} />
              <Fact term="AI check" value={c.aiLatencyMs !== null ? `${(c.aiLatencyMs / 1000).toFixed(1)}s` : "–"} />
              <Fact term="Cost" value={formatInr((c.voiceMinutes ?? 0) * rates().inrPerVoiceMinute + (c.aiCostUsd ?? 0) * rates().inrPerUsd)} />
              <Fact term="Call id" value={<span className="break-all font-mono text-xs">{c.vaaniCallId}</span>} />
            </dl>
          </Card>
          {prior.length > 0 && (
            <Card title={`Called before (${prior.length})`}>
              <ul className="space-y-2 text-sm">
                {prior.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3">
                    <Link href={`/calls/${p.id}`} className="text-stone-700 hover:underline">
                      {formatSlot(p.startedAt)}
                    </Link>
                    <Badge tone={OUTCOME[p.route ?? "in_progress"].tone}>{OUTCOME[p.route ?? "in_progress"].label}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

const CALLOUT = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-950",
  warn: "border-amber-200 bg-amber-50 text-amber-950",
  bad: "border-red-200 bg-red-50 text-red-950",
  muted: "border-stone-200 bg-stone-100 text-stone-800",
};

function Callout({ tone, title, children }: { tone: keyof typeof CALLOUT; title: string; children?: React.ReactNode }) {
  return (
    <div role={tone === "bad" ? "alert" : undefined} className={`rounded-xl border px-5 py-4 ${CALLOUT[tone]}`}>
      <p className="font-medium">{title}</p>
      {children && <p className="mt-1 text-sm opacity-90">{children}</p>}
    </div>
  );
}

function Answers({ call: c }: { call: CallRecord }) {
  const a = c.answers;
  const rows: [string, string | null | undefined][] = [
    ["Name", a.name],
    ["Area", a.locality],
    ["Property", a.property_type && `${a.property_type[0].toUpperCase()}${a.property_type.slice(1)}${a.size_sqft ? `, ${a.size_sqft.toLocaleString("en-IN")} sq ft` : ""}`],
    ["Scope", a.scope],
    ["Wants it done by", a.completion],
    ["Decides", a.decision_maker],
    ["Budget (volunteered)", a.budget_volunteered],
    ["Notes", a.notes],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-stone-500">{k}</dt>
          <dd className={v ? "text-stone-900" : "text-stone-400"}>{v || "Not given"}</dd>
        </div>
      ))}
    </dl>
  );
}

function Transcript({ text }: { text: string | null }) {
  const turns = parseTranscript(text);
  if (!turns.length) return <p className="text-sm text-stone-600">No transcript yet. Vaani sends it a minute or two after the call ends.</p>;
  return (
    <ol className="space-y-3">
      {turns.map((t, i) => (
        <li key={i} className={`flex flex-col ${t.who === "caller" ? "items-end" : "items-start"}`}>
          <span className="mb-1 text-xs text-stone-500">
            {t.who === "agent" ? "Front desk" : "Caller"}
            {t.at && <span className="tabular-nums"> · {t.at}</span>}
          </span>
          <p
            className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              t.who === "agent" ? "rounded-tl-sm bg-stone-100 text-stone-900" : "rounded-tr-sm bg-accent-soft text-stone-900"
            }`}
          >
            {t.text}
          </p>
        </li>
      ))}
    </ol>
  );
}

function Fact({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-stone-500">{term}</dt>
      <dd className="min-w-0 text-right text-stone-900">{value}</dd>
    </div>
  );
}

function RecordLink({ href, id }: { href: string | null; id: string | null }) {
  if (!id) return <span className="text-stone-400">None</span>;
  if (!href) return <span className="font-mono text-xs">{id}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent hover:underline">
      Open in HubSpot <span aria-hidden>↗</span>
    </a>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading call">
      <Skeleton className="h-16 w-80 max-w-full" />
      <Skeleton className="h-16" />
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Skeleton className="h-96" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
