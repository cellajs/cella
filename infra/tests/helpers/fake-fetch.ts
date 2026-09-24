import { vi } from 'vitest';

export type FetchArgs = { url: string; init: RequestInit };

/**
 * Routed `fetch` fake for Scaleway API tests: the first route whose method matches and whose `match` is a substring of the URL answers,
 * an unmatched call returns 599 so the failing request names itself. `calls` records every request for assertions on bodies and order.
 */
export function makeFetch(routes: Array<{ method: string; match: string; body?: unknown; status?: number }>) {
  const calls: FetchArgs[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init.method ?? 'GET').toUpperCase();
    calls.push({ url, init });

    const route = routes.find((r) => r.method === method && url.includes(r.match));
    if (!route) return new Response(`no mock for ${method} ${url}`, { status: 599 });
    if (route.status === 204) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(route.body ?? {}), {
      status: route.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return { fn, calls };
}
