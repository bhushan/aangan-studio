import type { Metadata } from "next";
import { Suspense } from "react";
import { dashboardRepo } from "@/lib/dashboard";
import { inView, parseRange, parseView, RANGES, type RangeKey, rangeStart, VIEWS, type ViewKey } from "@/lib/metrics";
import { CallList } from "../_components/call-row";
import { Empty, PageHeader, Segmented, Skeleton } from "../_components/ui";

export const metadata: Metadata = { title: "Calls · Aangan Studio" };

export default function CallsPage({ searchParams }: PageProps<"/calls">) {
  return (
    <>
      <PageHeader title="Calls" description="Newest first. Open a call for the caller's answers, the five checks, and the full transcript." />
      <Suspense fallback={<ListSkeleton />}>
        <Calls searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const VIEW_ORDER: ViewKey[] = ["all", "follow_up", "booked", "closed"];

const EMPTY: Record<ViewKey, string> = {
  all: "No calls in this period",
  follow_up: "Nobody is waiting on a call back",
  booked: "No consultations booked in this period",
  closed: "No caller was turned away in this period",
};

async function Calls({ searchParams }: { searchParams: PageProps<"/calls">["searchParams"] }) {
  const sp = await searchParams;
  const view = parseView(sp.view);
  const range = parseRange(sp.range);
  const repo = await dashboardRepo();
  const calls = await repo.list(rangeStart(range, new Date()), 500);
  const shown = calls.filter((c) => inView(c, view));

  const href = (v: ViewKey, r: RangeKey) => {
    const q = new URLSearchParams();
    if (v !== "all") q.set("view", v);
    if (r !== "30d") q.set("range", r);
    return `/calls${q.size ? `?${q}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          label="Filter calls"
          options={VIEW_ORDER.map((key) => ({ key, label: VIEWS[key], count: calls.filter((c) => inView(c, key)).length }))}
          current={view}
          href={(v) => href(v, range)}
        />
        <Segmented
          label="Time range"
          options={(Object.keys(RANGES) as RangeKey[]).map((key) => ({ key, label: RANGES[key] }))}
          current={range}
          href={(r) => href(view, r)}
        />
      </div>
      {shown.length ? (
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
          <CallList calls={shown} />
        </div>
      ) : (
        <Empty title={EMPTY[view]}>{range !== "all" && "Try a longer time range."}</Empty>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading calls">
      <Skeleton className="h-9 w-96 max-w-full" />
      <Skeleton className="h-96" />
    </div>
  );
}
