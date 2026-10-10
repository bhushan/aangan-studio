import { getDeps } from "../deps";
import type { Deps } from "../handlers";
import { isAuthorized } from "./adapter";

/** Wraps a handler as a POST route: shared-secret check, JSON in, JSON out, bad input -> 400. */
export function vaaniRoute(handler: (body: unknown, deps: Deps) => Promise<unknown>) {
  return async function POST(req: Request): Promise<Response> {
    if (!isAuthorized(req.headers, process.env.VAANI_TOOL_SECRET, new URL(req.url))) {
      // Header names only, never values, to see how a caller sends its secret.
      console.warn(`vaani 401: headers [${[...req.headers.keys()].join(", ")}], query secret ${new URL(req.url).searchParams.has("secret")}`);
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid JSON" }, { status: 400 });
    }
    try {
      return Response.json(await handler(body, getDeps()));
    } catch (err) {
      const message = (err as Error).message;
      const status = /^(Missing|invalid)\b/i.test(message) ? 400 : 500;
      console.error(`vaani route failed (${status})`, err);
      return Response.json({ error: status === 400 ? message : "internal error" }, { status });
    }
  };
}
