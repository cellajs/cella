import { errorMessage } from '../utils/errors.ts';
import { type FetchLike, resolveFetch } from '../utils/fetch-like.ts';
import { retry } from '../utils/retry.ts';

// SCW_DEBUG only, never the generic DEBUG var: verbose mode prints API bodies into retained CI logs.
const DEBUG = process.env.SCW_DEBUG === '1';

/** True for endpoints whose bodies carry live secret values (Secret Manager access, IAM api-key minting, a machine's user data). Verbose logging redacts these bodies. */
export function carriesSecretValues(url: string): boolean {
  return url.includes('/secret-manager/') || url.includes('/api-keys') || url.includes('/user_data/');
}

const REDACTED = '[redacted: secret-bearing endpoint]';

// A rejected fetch is a transient network failure, and so is an answer of `transientStatuses`: one blip must not fail a deploy's read.
const attempts = 3;
const retryDelayMs = 2000;

/** Answers of an endpoint that did no work: too many requests, or a gateway that reached no service. */
const transientStatuses = new Set([429, 502, 503, 504]);

/** The longest a `Retry-After` holds a call. */
const maxRetryAfterMs = 30_000;

/** A `Retry-After` header as milliseconds from `now`: seconds or an HTTP date; undefined when absent or unreadable. */
export function retryAfterMs(header: string | null | undefined, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const ms = /^\d+$/.test(header.trim()) ? Number(header) * 1000 : Date.parse(header) - now;
  return Number.isFinite(ms) ? Math.min(Math.max(ms, 0), maxRetryAfterMs) : undefined;
}

/** The undici codes of a connection that never opened: the request never reached Scaleway. */
const unsentCodes = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT']);

/** Whether a failed fetch never reached the endpoint. Sending it again then creates nothing twice. */
function neverSent(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : undefined;
  return typeof cause === 'object' && cause !== null && 'code' in cause && unsentCodes.has(String(cause.code));
}

export interface ScwAuth {
  secretKey: string;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: FetchLike;
}

/** S3-protocol endpoint for a Scaleway region (state bucket, boot-diag, …). */
export function scwS3Endpoint(region: string): string {
  return `https://s3.${region}.scw.cloud`;
}

/** How long one call may take before it fails as a network error, so a stalled endpoint never holds a screen or a deploy step for good. */
const REQUEST_TIMEOUT_MS = 60_000;

async function request(auth: ScwAuth, method: string, url: string, body?: string, contentType = 'application/json'): Promise<string> {
  if (DEBUG) {
    const bodyLog = body ? ` body=${carriesSecretValues(url) ? REDACTED : body}` : '';
    process.stderr.write(`[scw] → ${method} ${url}${bodyLog}\n`);
  }
  const fetchImpl = resolveFetch(auth.fetchImpl);
  let tried = 0;
  try {
    return await retry(
      async (attempt) => {
        tried = attempt;
        const res = await fetchImpl(url, {
          method,
          headers: { 'X-Auth-Token': auth.secretKey, 'Content-Type': contentType },
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const text = await res.text();
        if (DEBUG) process.stderr.write(`[scw] ← ${res.status} ${carriesSecretValues(url) ? REDACTED : text.slice(0, 500)}\n`);
        if (res.ok) return text;
        throw Object.assign(new Error(`Scaleway ${method} ${url} → ${res.status}: ${text}`), {
          status: res.status,
          retryAfterMs: retryAfterMs(res.headers?.get('retry-after')),
        });
      },
      {
        attempts,
        delayMs: (error) =>
          error instanceof Error && 'retryAfterMs' in error && typeof error.retryAfterMs === 'number' ? error.retryAfterMs : retryDelayMs,
        retryable: (error) => {
          const status = scwErrorStatus(error);
          // A create that timed out or met a 5xx may have been made: a POST is sent again only when it never left or was refused as one too many.
          if (method === 'POST') return status === undefined ? neverSent(error) : status === 429;
          return status === undefined || transientStatuses.has(status);
        },
        onRetry: (attempt, error) =>
          console.warn(`[scw] ${method} ${url} attempt ${attempt} failed (${errorMessage(error).slice(0, 200)}); retrying`),
      },
    );
  } catch (err) {
    if (scwErrorStatus(err) !== undefined) throw err;
    throw new Error(`Scaleway ${method} ${url} failed after ${tried} attempts: ${errorMessage(err)}`);
  }
}

/** The HTTP status a failed Scaleway call carried, on the error {@link scwFetch} throws; undefined for a failure without an answer. */
export function scwErrorStatus(error: unknown): number | undefined {
  return error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : undefined;
}

/**
 * True when Scaleway gave no verdict on a call: it never answered, its answer was no JSON, or it failed on its own side (5xx, 429). A key
 * such a call carried was not refused, so the CLI keeps it.
 */
export function scwUnanswered(error: unknown): boolean {
  const status = scwErrorStatus(error);
  if (status !== undefined) return status >= 500 || status === 429;
  return error instanceof Error && /Scaleway \S+ \S+ (failed after \d+ attempts|returned an empty body|returned non-JSON body)/.test(error.message);
}

/** Authenticated Scaleway call whose JSON response body is the result. */
export async function scwFetch<T>(auth: ScwAuth, method: string, url: string, body?: unknown): Promise<T> {
  const text = await request(auth, method, url, body === undefined ? undefined : JSON.stringify(body));
  if (text === '') throw new Error(`Scaleway ${method} ${url} returned an empty body where JSON was expected`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Scaleway ${method} ${url} returned non-JSON body: ${text.slice(0, 200)}`);
  }
}

/** Authenticated Scaleway call with no expected response body (DELETE, 204). */
export async function scwSend(auth: ScwAuth, method: string, url: string, body?: unknown): Promise<void> {
  await request(auth, method, url, body === undefined ? undefined : JSON.stringify(body));
}

/** Authenticated Scaleway call that sends and answers plain text, as a machine's user data does. */
export function scwText(auth: ScwAuth, method: string, url: string, text?: string): Promise<string> {
  return request(auth, method, url, text, 'text/plain');
}
