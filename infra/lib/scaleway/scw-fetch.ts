import { type FetchLike, resolveFetch } from '../utils/fetch-like'

const DEBUG = process.env.SCW_DEBUG === '1' || process.env.DEBUG === '1'

export interface ScwAuth {
  secretKey: string
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: FetchLike
}

/** S3-protocol endpoint for a Scaleway region (state bucket, boot-diag, …). */
export function scwS3Endpoint(region: string): string {
  return `https://s3.${region}.scw.cloud`
}

async function request(auth: ScwAuth, method: string, url: string, body?: unknown): Promise<string> {
  if (DEBUG) process.stderr.write(`[scw] → ${method} ${url}${body ? ` body=${JSON.stringify(body)}` : ''}\n`)
  const fetchImpl = resolveFetch(auth.fetchImpl)
  const res = await fetchImpl(url, {
    method,
    headers: { 'X-Auth-Token': auth.secretKey, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (DEBUG) process.stderr.write(`[scw] ← ${res.status} ${text.slice(0, 500)}\n`)
  if (!res.ok) throw new Error(`Scaleway ${method} ${url} → ${res.status}: ${text}`)
  return text
}

/** Authenticated Scaleway call whose JSON response body is the result. */
export async function scwFetch<T>(auth: ScwAuth, method: string, url: string, body?: unknown): Promise<T> {
  const text = await request(auth, method, url, body)
  if (text === '') throw new Error(`Scaleway ${method} ${url} returned an empty body where JSON was expected`)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Scaleway ${method} ${url} returned non-JSON body: ${text.slice(0, 200)}`)
  }
}

/** Authenticated Scaleway call with no expected response body (DELETE, 204). */
export async function scwSend(auth: ScwAuth, method: string, url: string, body?: unknown): Promise<void> {
  await request(auth, method, url, body)
}
