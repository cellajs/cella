import { appConfig } from 'shared';
import type { ProbeResult } from '#/lib/health-helpers';

/** Probes siblings over their real network path; short caching keeps it cheap and the timeout bounds a stall. */
const probeTimeoutMs = 2_000;
const probeCacheTtlMs = 10_000;

const cache = new Map<string, { at: number; result: ProbeResult }>();

export async function probeWorker(baseUrl: string): Promise<ProbeResult> {
  const cached = cache.get(baseUrl);
  if (cached && Date.now() - cached.at < probeCacheTtlMs) return cached.result;

  const result = await runProbe(baseUrl);
  cache.set(baseUrl, { at: Date.now(), result });
  return result;
}

async function runProbe(baseUrl: string): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), probeTimeoutMs);
  const startedAt = Date.now();
  try {
    // WebSocket workers advertise ws(s):// URLs, but /health speaks plain HTTP and fetch() rejects the ws scheme
    const httpBase = baseUrl.replace(/^ws(s?):/, 'http$1:');
    const res = await fetch(`${httpBase}/health?depth=full`, { signal: controller.signal, headers: { accept: 'application/json' } });
    const latencyMs = Date.now() - startedAt;
    if (!res.ok) return { ok: false, latencyMs, reason: `http_${res.status}` };
    const body = (await res.json()) as Record<string, unknown>;
    return { ok: true, latencyMs, body };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const reason = err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'unreachable';
    return { ok: false, latencyMs, reason };
  } finally {
    clearTimeout(timer);
  }
}

/** Curate the yjs worker's flat health body into component details. */
function extractYjsDetails(body: Record<string, unknown>): Record<string, unknown> {
  return {
    connections: body.connections ?? null,
    documents: body.documents ?? null,
    clients: body.clients ?? null,
    eventLoopLagMs: body.eventLoopLagMs ?? null,
    listener: body.listener ?? null,
  };
}

/** Curate the mcp worker's envelope (its own `mcp` self-component) into details. */
function extractMcpDetails(body: Record<string, unknown>): Record<string, unknown> {
  const components = body.components as Record<string, { details?: Record<string, unknown> }> | undefined;
  const mcpDetails = components?.mcp?.details;
  if (mcpDetails) return mcpDetails;
  return { mode: body.mode ?? null };
}

/** Curate the oauth worker's envelope into the status of each of its checks (database, signing key, invalidation). */
function extractOauthDetails(body: Record<string, unknown>): Record<string, unknown> {
  const components = (body.components ?? {}) as Record<string, { status?: string }>;
  return Object.fromEntries(Object.entries(components).map(([name, component]) => [name, component.status ?? null]));
}

/** The sibling workers the api process probes, in the order the health response lists them, each with how its body reads. */
export const probedWorkers = [
  { name: 'yjs', url: appConfig.yjsUrl, details: extractYjsDetails },
  { name: 'mcp', url: appConfig.mcpUrl, details: extractMcpDetails },
  { name: 'oauth', url: appConfig.oauthUrl, details: extractOauthDetails },
] as const;
