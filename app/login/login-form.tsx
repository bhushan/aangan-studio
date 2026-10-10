"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { signIn, type SignInState } from "./actions";

export function LoginForm() {
  const next = useSearchParams().get("next") ?? "";
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, { error: null });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-stone-800">
          Studio password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "password-error" : undefined}
          className="mt-1.5 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-stone-900 shadow-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 aria-invalid:border-red-400"
        />
        {state.error && (
          <p id="password-error" role="alert" className="mt-2 text-sm text-red-700">
            {state.error}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-60"
      >
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
