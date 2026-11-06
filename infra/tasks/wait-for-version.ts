import { healthContract } from '../config/health.config';
import { type ScwAuth, scwFetch } from '../lib/scaleway/scw-fetch';

export interface ProbeResult {
  /** HTTP status of the response, or 0 if the request failed entirely. */
  status: number;
  /** Value of the X-App-Version header, lowercased lookup, or undefined. */
  version: string | undefined;
  /** The answer is an HTML page: the frontend's route answered where the service has none, with the release header of the frontend. */
  html?: true;
}

/** Performs a single HTTP probe. Injectable so a caller can be unit-tested. */
export type ProbeFn = (url: string) => Promise<ProbeResult>;

/**
 * A probe is healthy on any 2xx (the SPA proxy's 200, the API services' 204) AND a served version matching the expected SHA.
 * A 2xx with a stale or missing version means the old machine is still answering.
 */
export function isHealthy(result: ProbeResult, expectedSha: string): boolean {
  const statusOk = result.status >= 200 && result.status < 300;
  return statusOk && result.version === expectedSha;
}

/** Default probe using global fetch with a per-request timeout. A network, TLS, or timeout failure reports status 0. */
export function createFetchProbe(timeoutMs: number): ProbeFn {
  return async (url) => {
    try {
      // Probe WebSocket services over HTTP because their health endpoint is not a WebSocket.
      const res = await fetch(url.replace(/^ws(s?):/, 'http$1:'), { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
      const html = (res.headers.get('content-type') ?? '').startsWith('text/html');
      return { status: res.status, version: res.headers.get(healthContract.versionHeader) ?? undefined, ...(html ? { html: true as const } : {}) };
    } catch {
      return { status: 0, version: undefined };
    }
  };
}

/** One server of a pool as the load balancer's stats name it. */
export interface PoolServerStat {
  backend_id: string;
  ip: string;
  /** `running` while the load balancer routes to it; `stopped` once its check failed (`starting` and `stopping` between). */
  server_state: string;
  last_health_check_status?: string;
}

/**
 * Whether a pool routes to an address: its server there is `running`. The agent answers 200 only for the release its machine was made for,
 * so a running server is that release serving. `last_health_check_status` is no guide: in a measured switch it read `failed` while the server ran.
 */
export function isServing(stats: readonly PoolServerStat[], backendId: string, address: string): boolean {
  return stats.some((stat) => stat.backend_id === backendId && stat.ip === address && stat.server_state === 'running');
}

/** The load balancer's view of every server of every pool, read with `LoadBalancersReadOnly`. */
export function lbServerStats(auth: ScwAuth, zone: string, lbId: string): () => Promise<PoolServerStat[]> {
  return async () =>
    (await scwFetch<{ backend_servers_stats?: PoolServerStat[] }>(auth, 'GET', `https://api.scaleway.com/lb/v1/zones/${zone}/lbs/${lbId}/stats`))
      .backend_servers_stats ?? [];
}

/**
 * Wait until every pool given routes to `address` (`serving`), or none does any more (`out`). `failed` is asked each round, so a machine
 * whose boot account says it failed ends the wait at once. A stats read that fails counts as no answer yet.
 * @returns `done`, `failed`, or `timeout` once `timeoutMs` passed
 */
export async function waitForPools(opts: {
  backendIds: readonly string[];
  address: string;
  want: 'serving' | 'out';
  stats: () => Promise<PoolServerStat[]>;
  timeoutMs: number;
  intervalMs?: number;
  failed?: () => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<'done' | 'failed' | 'timeout'> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const deadline = now() + opts.timeoutMs;
  for (;;) {
    const stats = await opts.stats().catch(() => undefined);
    if (stats) {
      const routed = opts.backendIds.map((backendId) => isServing(stats, backendId, opts.address));
      if (opts.want === 'serving' ? routed.every(Boolean) : !routed.some(Boolean)) return 'done';
    }
    if (opts.failed && (await opts.failed().catch(() => false))) return 'failed';
    if (now() >= deadline) return 'timeout';
    await sleep(opts.intervalMs ?? 3_000);
  }
}
