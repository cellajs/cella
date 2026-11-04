import { queryOptions } from '@tanstack/react-query';
import { appConfig } from 'shared';
import type { HealthResponse } from 'shared/health-status';

const healthUrl = `${appConfig.backendUrl}/health?depth=full`;
const healthPollMs = 30_000;

/** Null when the backend cannot be reached: the info panel suspends on this query, so a failure must resolve, not throw. */
async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse | null> {
  try {
    const response = await fetch(healthUrl, { cache: 'no-store', signal });
    // A 503 still carries the diagnostics: it names which component is down.
    if (!response.ok && response.status !== 503) return null;
    return (await response.json()) as HealthResponse;
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}

/** Backend health status for the info panel; polls while that panel is open. */
export const healthQueryOptions = () =>
  queryOptions({
    queryKey: ['health'],
    queryFn: ({ signal }) => fetchHealth(signal),
    refetchInterval: healthPollMs,
    staleTime: healthPollMs,
    // Transient health data: not persisted to IDB.
    meta: { persist: false },
  });
