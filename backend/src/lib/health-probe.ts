import { appConfig } from 'shared';
import type { ProbeResult } from '#/lib/health-helpers';

/**
 * Active health probes for sibling workers (yjs, ai).
 *
 * Each probe hits the worker's own `/health?depth=full` over the real network
 * path, so it catches not just process death but config/IP/ingress faults that
 * a self-report could never surface (this is exactly the failure mode that took
 * CDC down). Results are cached briefly so the backend's `/health` stays cheap
 * even under frequent polling, and every probe is bounded by a short timeout so
 * a hung worker can't stall the endpoint.
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
    const res = await fetch(`${baseUrl}/health?depth=full`, {
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

/** Curate the ai worker's envelope (its own `ai` self-component) into details. */
export function extractAiDetails(body: Record<string, unknown>): Record<string, unknown> {
  const components = body.components as Record<string, { details?: Record<string, unknown> }> | undefined;
  const aiDetails = components?.ai?.details;
  if (aiDetails) return aiDetails;
  return { mode: body.mode ?? null, queueDepth: null };
}

export const workerUrls = { yjs: appConfig.yjsUrl, ai: appConfig.aiUrl };
