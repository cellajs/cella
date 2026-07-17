import { useEffect } from 'react';

interface UseFetchMoreOnDemandOptions {
  /** Level-triggered demand signal: true while the UI wants more rows (viewport near the end / sentinel in view). */
  demand: boolean;
  hasNextPage: boolean;
  isFetching: boolean;
  /** Blocks fetching while truthy so a failing page doesn't retry in a loop. */
  error: boolean;
  fetchMore?: () => Promise<unknown>;
}

/**
 * Satisfies a level-triggered "load more" demand: fetches whenever demand is
 * present AND the query can accept it. The effect re-evaluates on every input
 * change, so demand that arrives during a background refetch (mount refetch of
 * persisted pages, reconnect, sync invalidation) is served once the refetch
 * settles instead of being dropped — one-shot edge-triggered callbacks lost
 * those and permanently stalled infinite scroll.
 */
export function useFetchMoreOnDemand({
  demand,
  hasNextPage,
  isFetching,
  error,
  fetchMore,
}: UseFetchMoreOnDemandOptions): void {
  useEffect(() => {
    if (!demand || !fetchMore || isFetching || !hasNextPage || error) return;
    fetchMore();
  }, [demand, fetchMore, isFetching, hasNextPage, error]);
}
