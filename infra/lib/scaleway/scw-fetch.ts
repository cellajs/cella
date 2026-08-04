import { errorMessage } from '../utils/errors';
import { type FetchLike, resolveFetch } from '../utils/fetch-like';
import { retry } from '../utils/retry';

// SCW_DEBUG only: the generic DEBUG var is set casually while troubleshooting
// unrelated tools, and verbose mode must never be a one-variable accident away
// from printing API bodies into retained CI logs.
const DEBUG = process.env.SCW_DEBUG === '1';

/**
 * True for endpoints whose request or response bodies carry live secret
 * values: Secret Manager versions/access (base64 secret data) and IAM api-key
 * minting (the response contains the new secret key). Verbose logging redacts
 * bodies for these so even deliberate debugging cannot print values.
 */
export function carriesSecretValues(url: string): boolean {
  return url.includes('/secret-manager/') || url.includes('/api-keys');
}

const REDACTED = '[redacted: secret-bearing endpoint]';

// A rejected fetch is a transient network failure (an HTTP error status
// resolves); one runner blip must not fail a whole deploy preflight.
const networkAttempts = 3;
const networkRetryDelayMs = 2000;

export interface ScwAuth {
  secretKey: string;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: FetchLike;
}

/** S3-protocol endpoint for a Scaleway region (state bucket, boot-diag, …). */
export function scwS3Endpoint(region: string): string {
  return `https://s3.${region}.scw.cloud`;
}

async function request(auth: ScwAuth, method: string, url: string, body?: unknown): Promise<string> {
  if (DEBUG) {
    const bodyLog = body ? ` body=${carriesSecretValues(url) ? REDACTED : JSON.stringify(body)}` : '';
    process.stderr.write(`[scw] → ${method} ${url}${bodyLog}\n`);
  }
  const fetchImpl = resolveFetch(auth.fetchImpl);
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await retry(
      () =>
        fetchImpl(url, {
          method,
          headers: { 'X-Auth-Token': auth.secretKey, 'Content-Type': 'application/json' },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        }),
      {
        attempts: networkAttempts,
        delayMs: networkRetryDelayMs,
        onRetry: (attempt, error) =>
          console.warn(`[scw] ${method} ${url} attempt ${attempt} failed (${errorMessage(error)}); retrying`),
      },
    );
  } catch (err) {
    throw new Error(`Scaleway ${method} ${url} failed after ${networkAttempts} attempts: ${errorMessage(err)}`);
  }
  const text = await res.text();
  if (DEBUG)
    process.stderr.write(`[scw] ← ${res.status} ${carriesSecretValues(url) ? REDACTED : text.slice(0, 500)}\n`);
  if (!res.ok) throw new Error(`Scaleway ${method} ${url} → ${res.status}: ${text}`);
  return text;
}

/** Authenticated Scaleway call whose JSON response body is the result. */
export async function scwFetch<T>(auth: ScwAuth, method: string, url: string, body?: unknown): Promise<T> {
  const text = await request(auth, method, url, body);
  if (text === '') throw new Error(`Scaleway ${method} ${url} returned an empty body where JSON was expected`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Scaleway ${method} ${url} returned non-JSON body: ${text.slice(0, 200)}`);
  }
}

/** Authenticated Scaleway call with no expected response body (DELETE, 204). */
export async function scwSend(auth: ScwAuth, method: string, url: string, body?: unknown): Promise<void> {
  await request(auth, method, url, body);
}
