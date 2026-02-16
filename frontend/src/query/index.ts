/**
 * React Query configuration and utilities.
 *
 * Core query infrastructure:
 * - Query client instance
 * - Cache persistence
 * - Provider component
 * - Global handlers
 */

export { onError } from './on-error';
export { onSuccess } from './on-success';
export { persister } from './persister';
export { QueryClientProvider } from './provider';
export { queryClient } from './query-client';
export type {
  BaseQueryItem,
  BaseQueryResponce,
  ContextQueryProp,
  InfiniteQueryData,
  PageParams,
  QueryData,
} from './types';
