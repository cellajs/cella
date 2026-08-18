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

/** Fulfills level-triggered load demand whenever the query can accept it, re-evaluating after background fetches. */
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
