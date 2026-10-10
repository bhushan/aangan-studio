"use client";

export default function DashError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-6 py-12 text-center">
      <p className="font-medium text-stone-900">The dashboard couldn&apos;t load its data</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-stone-600">
        Calls are still being answered and recorded. This is usually a brief database hiccup, so try again in a moment.
      </p>
      <button onClick={reset} className="mt-4 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800">
        Try again
      </button>
    </div>
  );
}
