/**
 * Minimal structural `fetch` surface shared by every module that performs raw
 * HTTP against the Scaleway APIs with an injectable implementation (tasks,
 * the VM boot agent, the shared Scaleway clients).
 *
 * Shaped so the native `fetch` (DOM lib or Node's undici) is directly
 * assignable: narrower parameter types, `Response` is a superset of the
 * return shape. This lets `resolveFetch` avoid any casting.
 */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>

/** The injected implementation when given, else the global `fetch`. */
export function resolveFetch(fetchImpl?: FetchLike): FetchLike {
  return fetchImpl ?? globalThis.fetch
}
