import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Aangan Studio" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span aria-hidden className="mx-auto flex size-10 items-center justify-center rounded-xl bg-accent text-lg font-semibold text-white">
            A
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-stone-900">Aangan Studio enquiries</h1>
          <p className="mt-1 text-sm text-stone-600">Every call the front desk took, and what happened next.</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
