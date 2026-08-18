import type { ApiError } from '~/lib/api';

/** Shared by queries and mutations; passed as `meta: { ... }` on `useQuery`, `useMutation`, or `queryOptions`. */
export type QueryMeta = {
  /** Skip dehydrating this query into the persisted IDB cache. Default: true. */
  persist?: boolean;
  /** Skips the global error toast; a predicate suppresses only the errors it matches. */
  suppressGlobalErrorToast?: boolean | ((err: ApiError) => boolean);
  /** Org/tenant context used by SSE handlers + setQueryDefaults to resolve fetch params. */
  organizationId?: string;
  tenantId?: string;
};

// Makes ApiError the default error type for every TanStack Query hook and types `meta` for the suppression flag.
declare module '@tanstack/react-query' {
  interface Register {
    defaultError: ApiError;
    queryMeta: QueryMeta;
    mutationMeta: QueryMeta;
  }
}
