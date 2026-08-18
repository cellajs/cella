/** Minimal structural `fetch` type for raw HTTP against the Scaleway APIs. Shaped so native `fetch` is directly assignable and `resolveFetch` needs no cast. */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  /** Response headers; optional so minimal test doubles stay assignable. */
  headers?: { get(name: string): string | null };
}>;

/** The injected implementation when given, else the global `fetch`. */
export function resolveFetch(fetchImpl?: FetchLike): FetchLike {
  return fetchImpl ?? globalThis.fetch;
}
