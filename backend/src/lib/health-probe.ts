import { appConfig } from 'shared';
import type { ProbeResult } from '#/lib/health-helpers';
import { TTLCache } from '#/lib/ttl-cache';

/** Probes siblings over their real network path; short caching keeps it cheap and the timeout bounds a stall. */
const probeTimeoutMs = 2_000;

/** One entry per probed worker URL. */
const probeCache = new TTLCache<ProbeResult>({ maxSize: 3, defaultTtl: 10_000 });

/** Probes a sibling worker's `/health?depth=full`, answering from a per-URL cache for 10 s; concurrent callers share one probe. */
export const probeWorker = (baseUrl: string): Promise<ProbeResult> => probeCache.load(baseUrl, () => runProbe(baseUrl));

async function runProbe(baseUrl: string): Promise<ProbeResult> {
  const startedAt = Date.now();
  try {
    // WebSocket workers advertise ws(s):// URLs, but /health speaks plain HTTP and fetch() rejects the ws scheme
    const httpBase = baseUrl.replace(/^ws(s?):/, 'http$1:');
    const res = await fetch(`${httpBase}/health?depth=full`, {
      signal: AbortSignal.timeout(probeTimeoutMs),
      headers: { accept: 'application/json' },
    });
    const latencyMs = Date.now() - startedAt;
    if (!res.ok) return { ok: false, latencyMs, reason: `http_${res.status}` };
    return { ok: true, latencyMs, body: (await res.json()) as Record<string, unknown> };
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'unreachable';
    return { ok: false, latencyMs: Date.now() - startedAt, reason };
  }
}

/** Curate the yjs worker's flat health body into component details. */
function extractYjsDetails(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(['connections', 'documents', 'clients', 'eventLoopLagMs', 'listener'].map((key) => [key, body[key] ?? null] as const));
}

/** Curate the oauth worker's envelope into the status of each of its checks (database, signing key, invalidation). */
function extractOauthDetails(body: Record<string, unknown>): Record<string, unknown> {
  const components = (body.components ?? {}) as Record<string, { status?: string }>;
  return Object.fromEntries(Object.entries(components).map(([name, component]) => [name, component.status ?? null]));
}

/** The sibling workers the api process probes, in the order the health response lists them; the mcp worker's status is its whole answer. */
export const probedWorkers = [
  { name: 'yjs', url: appConfig.yjsUrl, details: extractYjsDetails },
  { name: 'mcp', url: appConfig.mcpUrl, details: () => ({}) },
  { name: 'oauth', url: appConfig.oauthUrl, details: extractOauthDetails },
] as const;
