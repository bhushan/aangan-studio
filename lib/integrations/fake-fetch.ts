// Test helper: a fetch that records requests and answers from a list of (method, url-substring) routes.
export type Recorded = { method: string; url: string; body: unknown; headers: Headers };
type Route = { method: string; match: string; status?: number; json: unknown };

export function fakeFetch(routes: Route[]) {
  const calls: Recorded[] = [];
  const fn: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body, headers: new Headers(init?.headers) });
    const route = routes.find((r) => r.method === method && url.includes(r.match));
    if (!route) return new Response(JSON.stringify({ message: `no fake for ${method} ${url}` }), { status: 404 });
    return new Response(JSON.stringify(route.json), { status: route.status ?? 200 });
  };
  return { fetch: fn, calls };
}
