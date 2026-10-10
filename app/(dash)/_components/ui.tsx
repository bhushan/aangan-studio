import Link from "next/link";
import type { ReactNode } from "react";
import type { Tone } from "@/lib/labels";

const TONE: Record<Tone, string> = {
  good: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warn: "bg-amber-50 text-amber-900 ring-amber-200",
  bad: "bg-red-50 text-red-800 ring-red-200",
  muted: "bg-stone-100 text-stone-700 ring-stone-200",
  live: "bg-sky-50 text-sky-800 ring-sky-200",
};

const DOT: Record<Tone, string> = {
  good: "bg-emerald-600",
  warn: "bg-amber-500",
  bad: "bg-red-600",
  muted: "bg-stone-400",
  live: "bg-sky-500",
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE[tone]}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${DOT[tone]}`} />
      {children}
    </span>
  );
}

export function Card({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-stone-200 bg-white ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-4 border-b border-stone-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5">
      <p className="text-sm text-stone-600">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-stone-900">{value}</p>
      {hint && <p className="mt-1 text-sm text-stone-500">{hint}</p>}
    </div>
  );
}

/** A row of links that behaves like tabs; the URL holds the state so views can be shared. */
export function Segmented<K extends string>({
  options,
  current,
  href,
  label,
}: {
  options: { key: K; label: string; count?: number }[];
  current: K;
  href: (key: K) => string;
  label: string;
}) {
  return (
    <nav aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {options.map((o) => {
        const active = o.key === current;
        return (
          <Link
            key={o.key}
            href={href(o.key)}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              active ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-200/60 hover:text-stone-900"
            }`}
          >
            {o.label}
            {o.count !== undefined && <span className={`tabular-nums ${active ? "text-stone-300" : "text-stone-400"}`}>{o.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{title}</h1>
      <p className="mt-1 text-stone-600">{description}</p>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-white/60 px-6 py-12 text-center">
      <p className="font-medium text-stone-900">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-stone-600">{children}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-xl bg-stone-200/70 ${className}`} />;
}
