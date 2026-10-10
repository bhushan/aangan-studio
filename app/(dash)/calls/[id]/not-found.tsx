import Link from "next/link";

export default function CallNotFound() {
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-6 py-12 text-center">
      <p className="font-medium text-stone-900">We couldn&apos;t find that call</p>
      <p className="mt-1 text-sm text-stone-600">The link may be from a test call that was cleaned up.</p>
      <Link href="/calls" className="mt-4 inline-block text-sm text-accent hover:underline">Back to all calls</Link>
    </div>
  );
}
