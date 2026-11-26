import { queryOptions } from '@tanstack/react-query';
import { appConfig } from 'shared';
import type { HealthResponse } from 'shared/health-status';

const healthUrl = `${appConfig.backendUrl}/health?depth=full`;
const healthPollMs = 30_000;
const healthTimeoutMs = 8000;

/**
 * Null without a usable answer within the timeout, which the info panel reads as unavailable. It takes no query signal:
 * query-core aborts a fetch that read its signal once the last observer unmounts, as the indicator does when the panel opens.
 */
async function fetchHealth(): Promise<HealthResponse | null> {
  try {
    const response = await fetch(healthUrl, { cache: 'no-store', signal: AbortSignal.timeout(healthTimeoutMs) });
    // A 503 still carries the diagnostics: it names which component is down.
    if (!response.ok && response.status !== 503) return null;
    return (await response.json()) as HealthResponse;
  } catch {
    return null;
  }
}

/** Backend health status for the info panel; polls while that panel is open. */
export const healthQueryOptions = () =>
  queryOptions({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: healthPollMs,
    staleTime: healthPollMs,
    // Transient health data: not persisted to IDB.
    meta: { persist: false },
  });
