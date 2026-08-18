import { queryOptions } from '@tanstack/react-query';
import { appConfig } from 'shared';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export type HealthComponent = { status: HealthStatus; label?: string };

export type HealthResponse = {
  status: HealthStatus;
  components: Record<string, HealthComponent>;
};

const HEALTH_URL = `${appConfig.backendUrl}/health?depth=full`;
const HEALTH_POLL_MS = 30_000;

async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(HEALTH_URL, { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
  return (await response.json()) as HealthResponse;
}

/** Backend health status for the info panel; polls while that panel is open. */
export const healthQueryOptions = () =>
  queryOptions({
    queryKey: ['health'],
    queryFn: ({ signal }) => fetchHealth(signal),
    refetchInterval: HEALTH_POLL_MS,
    staleTime: HEALTH_POLL_MS,
    // Transient health data: not persisted to IDB, and failures raise no global error toast.
    meta: { persist: false, suppressGlobalErrorToast: true },
  });
