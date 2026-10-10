"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { checkPassword, safeNext, SESSION_COOKIE, SESSION_DAYS, signSession } from "@/lib/session";

export type SignInState = { error: string | null };

export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const ok = await checkPassword(String(form.get("password") ?? ""), env("DASHBOARD_PASSWORD"));
  if (!ok) {
    // A short pause makes guessing the shared password slow.
    await new Promise((r) => setTimeout(r, 800));
    return { error: "That password didn't match. Check with Nikhil for the current one." };
  }
  (await cookies()).set(SESSION_COOKIE, await signSession(env("SESSION_SECRET"), new Date()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  redirect(safeNext(String(form.get("next") ?? "")));
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
