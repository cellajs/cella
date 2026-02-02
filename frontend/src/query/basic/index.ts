/**
 * Basic React Query utilities.
 *
 * Common utilities for queries and mutations:
 * - Query key factories
 * - Infinite query helpers
 * - Cache manipulation utilities
 * - Prefetch helpers
 */

export { compareQueryKeys } from './compare-query-keys';
export { createOptimisticEntity, type EntityFromSchema, getSchemaDefaults } from './create-optimistic';
export { createEntityKeys, type StandardEntityKeys } from './create-query-keys';
export {
  type EntityQueryKeys,
  getEntityQueryKeys,
  getRegisteredEntityTypes,
  hasEntityQueryKeys,
  registerEntityQueryKeys,
} from './entity-query-registry';
export { findInListCache, useFindInListCache } from './find-in-list-cache';
export { flattenInfiniteData } from './flatten';
export { getQueryKeySortOrder } from './get-query-key-sort-order';
export {
  changeArbitraryQueryData,
  changeInfiniteQueryData,
  changeQueryData,
  isArbitraryQueryData,
} from './helpers';
export { baseInfiniteQueryOptions, infiniteQueryUseCachedIfCompleteOptions } from './infinite-query-options';
export { invalidateIfLastMutation, invalidateOnMembershipChange, shouldSkipInvalidation } from './invalidation-helpers';
export {
  formatUpdatedCacheData,
  getExactQuery,
  getQueryItems,
  getSimilarQueries,
  isInfiniteQueryData,
  isQueryData,
} from './mutate-query';
export { prefetchQuery } from './prefetch-query';
export type {
  ArbitraryEntityQueryData,
  EntityIdAndType,
  EntityQueryData,
  InfiniteEntityQueryData,
  ItemData,
  QueryDataActions,
  UseMutateQueryDataReturn,
} from './types';
export { useInfiniteQueryTotal } from './use-infinite-query-total';
export { useMutateQueryData } from './use-mutate-query-data';
export { getPendingMutationsCount, usePendingMutations, usePendingMutationsCount } from './use-pending-mutations';
