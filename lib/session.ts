// Shared-password dashboard session: a cookie holding "<expiry ms>.<HMAC-SHA256 of expiry>".
// Web Crypto only, so the same code runs in proxy.ts and in server actions.

export const SESSION_COOKIE = "aangan_session";
export const SESSION_DAYS = 30;

const enc = new TextEncoder();

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signSession(secret: string, now: Date): Promise<string> {
  const exp = String(now.getTime() + SESSION_DAYS * 86400_000);
  return `${exp}.${await hmac(secret, exp)}`;
}

export async function verifySession(token: string | undefined, secret: string, now: Date): Promise<boolean> {
  const [exp, sig] = token?.split(".") ?? [];
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now.getTime()) return false;
  return same(sig, await hmac(secret, exp));
}

/** Compares digests, so neither the length nor the content of the password leaks through timing. */
export async function checkPassword(given: string, expected: string): Promise<boolean> {
  if (!given) return false;
  return same(await hmac("password", given), await hmac("password", expected));
}

/** Only same-site paths are allowed as a post-login destination. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/login")) return "/";
  return next;
}
