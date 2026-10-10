import { describe, expect, it } from "vitest";
import { authEnabled, checkPassword, safeNext, signSession, verifySession } from "./session";

const secret = "test-secret-not-real";
const now = new Date("2026-10-10T12:00:00Z");

describe("session token", () => {
  it("verifies a token it signed until it expires", async () => {
    const token = await signSession(secret, now);
    expect(await verifySession(token, secret, now)).toBe(true);
    expect(await verifySession(token, secret, new Date(now.getTime() + 29 * 86400_000))).toBe(true);
    expect(await verifySession(token, secret, new Date(now.getTime() + 31 * 86400_000))).toBe(false);
  });

  it("rejects tampered, foreign and empty tokens", async () => {
    const token = await signSession(secret, now);
    const [exp, sig] = token.split(".");
    expect(await verifySession(`${Number(exp) + 1}.${sig}`, secret, now)).toBe(false);
    expect(await verifySession(token, "other-secret", now)).toBe(false);
    expect(await verifySession(undefined, secret, now)).toBe(false);
    expect(await verifySession("garbage", secret, now)).toBe(false);
  });
});

describe("checkPassword", () => {
  it("matches only the exact password", async () => {
    expect(await checkPassword("open sesame", "open sesame")).toBe(true);
    expect(await checkPassword("open sesam", "open sesame")).toBe(false);
    expect(await checkPassword("", "open sesame")).toBe(false);
  });
});

describe("safeNext", () => {
  it.each([
    ["/calls?view=booked", "/calls?view=booked"],
    ["/calls/abc", "/calls/abc"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/login", "/"],
    [null, "/"],
  ])("%s -> %s", (input, out) => expect(safeNext(input)).toBe(out));
});

describe("authEnabled", () => {
  it("guards the dashboard only when a password is configured", () => {
    expect(authEnabled({ DASHBOARD_PASSWORD: "open sesame" })).toBe(true);
    expect(authEnabled({ DASHBOARD_PASSWORD: "" })).toBe(false);
    expect(authEnabled({})).toBe(false);
  });
});
