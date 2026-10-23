import type { ApiError } from '~/lib/api';

/** Shared by queries and mutations; passed as `meta: { ... }` on `useQuery`, `useMutation`, or `queryOptions`. A type alias: `Register` takes a meta only when it extends `Record<string, unknown>`, and an interface does not. */
export type QueryMeta = {
  /** Skip dehydrating this query into the persisted IDB cache. Default: true. */
  persist?: boolean;
  /** Skips the global error toast; a predicate suppresses only the errors it matches. */
  suppressGlobalErrorToast?: boolean | ((error: ApiError) => boolean);
  /** Org/tenant context used by SSE handlers + setQueryDefaults to resolve fetch params. */
  organizationId?: string;
  tenantId?: string;
  /** On a queued mutation in the persisted cache: the version of its variables' shape. The persister sets it. */
  variablesVersion?: number;
};

// Makes ApiError the default error type for every TanStack Query hook and types `meta` for the suppression flag.
declare module '@tanstack/react-query' {
  interface Register {
    defaultError: ApiError;
    queryMeta: QueryMeta;
    mutationMeta: QueryMeta;
  }
}
