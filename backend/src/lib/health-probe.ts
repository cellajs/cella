import { appConfig } from 'shared';
import type { ProbeResult } from '#/lib/health-helpers';

/**
 * Probes sibling workers through their real network path to include routing and config faults.
 * Short caching keeps backend health checks cheap, and a timeout prevents stalled workers from
 * blocking the endpoint.
 */
const PROBE_TIMEOUT_MS = 2_000;
const PROBE_CACHE_TTL_MS = 10_000;

const cache = new Map<string, { at: number; result: ProbeResult }>();

export async function probeWorker(baseUrl: string): Promise<ProbeResult> {
  const cached = cache.get(baseUrl);
  if (cached && Date.now() - cached.at < PROBE_CACHE_TTL_MS) return cached.result;

  const result = await runProbe(baseUrl);
  cache.set(baseUrl, { at: Date.now(), result });
  return result;
}

async function runProbe(baseUrl: string): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    // WebSocket workers advertise ws(s):// public URLs (e.g. yjs), but their
    // The /health endpoint speaks plain HTTP on the same host, and fetch() rejects
    // the ws scheme outright. Normalize the scheme so healthy services remain reachable.
    const httpBase = baseUrl.replace(/^ws(s?):/, 'http$1:');
    const res = await fetch(`${httpBase}/health?depth=full`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
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
export function extractYjsDetails(body: Record<string, unknown>): Record<string, unknown> {
  return {
    connections: body.connections ?? null,
    documents: body.documents ?? null,
    clients: body.clients ?? null,
    eventLoopLagMs: body.eventLoopLagMs ?? null,
  };
}

/** Curate the mcp worker's envelope (its own `mcp` self-component) into details. */
export function extractMcpDetails(body: Record<string, unknown>): Record<string, unknown> {
  const components = body.components as Record<string, { details?: Record<string, unknown> }> | undefined;
  const mcpDetails = components?.mcp?.details;
  if (mcpDetails) return mcpDetails;
  return { mode: body.mode ?? null, queueDepth: null };
}

export const workerUrls = { yjs: appConfig.yjsUrl, mcp: appConfig.mcpUrl };
