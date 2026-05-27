import type { ApiError } from '~/lib/api';

/**
 * Shared meta shape for both queries and mutations.
 * Pass via `meta: { ... }` on `useQuery` / `useMutation` / `queryOptions`.
 */
export type QueryMeta = {
  /** Skip dehydrating this query into the persisted IDB cache. Default: true. */
  persist?: boolean;
  /**
   * Skip the global error toast — useful when a local `onError` shows a more specific message.
   * Pass a predicate to suppress only certain errors (e.g. only 403s).
   */
  suppressGlobalErrorToast?: boolean | ((err: ApiError) => boolean);
  /** Org/tenant context used by SSE handlers + setQueryDefaults to resolve fetch params. */
  organizationId?: string;
  tenantId?: string;
};

// Make ApiError the default error type for all TanStack Query hooks, and type
// `meta` so consumers get autocomplete + safety on the suppression flag.
declare module '@tanstack/react-query' {
  interface Register {
    defaultError: ApiError;
    queryMeta: QueryMeta;
    mutationMeta: QueryMeta;
  }
}
