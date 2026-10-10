import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createNeonRepo } from "./calls/neon-repo";
import type { CallsRepo } from "./calls/repo";
import { env, optionalEnv } from "./env";
import { DEFAULT_RATES, type Rates } from "./metrics";
import { SESSION_COOKIE, verifySession } from "./session";

let repo: CallsRepo | null = null;

/** Reads for the dashboard. Checks the session again here; proxy.ts is only the first gate. */
export async function dashboardRepo(): Promise<CallsRepo> {
  await connection(); // dashboard data is always per request; also makes the clock reads below safe
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifySession(token, env("SESSION_SECRET"), new Date()))) redirect("/login");
  repo ??= createNeonRepo(env("DATABASE_URL"));
  return repo;
}

export function rates(): Rates {
  const num = (name: string) => Number(optionalEnv(name)) || undefined;
  return {
    inrPerVoiceMinute: num("VAANI_INR_PER_MINUTE") ?? DEFAULT_RATES.inrPerVoiceMinute,
    inrPerUsd: num("INR_PER_USD") ?? DEFAULT_RATES.inrPerUsd,
  };
}

const HUBSPOT_OBJECT = { contact: "0-1", deal: "0-3" } as const;

/** Deep link into HubSpot, e.g. https://app.hubspot.com/contacts/<portal>. Null until HUBSPOT_RECORD_URL is set. */
export function hubspotLink(kind: keyof typeof HUBSPOT_OBJECT, id: string | null): string | null {
  const base = optionalEnv("HUBSPOT_RECORD_URL")?.replace(/\/$/, "");
  return base && id ? `${base}/record/${HUBSPOT_OBJECT[kind]}/${id}` : null;
}
