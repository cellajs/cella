import { queryOptions } from '@tanstack/react-query';
import { getYjsToken } from 'sdk';
import type { ProductEntityType } from 'shared';
import { ApiError } from '~/lib/api';

/** A token lives five minutes and the relay closes its socket then; refetching at four keeps a fresh one ready for the reconnect. */
const YJS_TOKEN_REFETCH_MS = 4 * 60 * 1000;

export const yjsTokenKeys = { entity: (entityType: ProductEntityType, entityId: string) => ['yjs', 'token', entityType, entityId] as const };

/**
 * Why the backend will not issue a token, which no retry changes: `refused` for a 403, the caller may not edit the
 * entity; `deleted` for a 404, the entity is gone. Null for any other error.
 */
export const yjsTokenRefusal = (error: unknown) => {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 404) return 'deleted';
  return error.status === 403 ? 'refused' : null;
};

/** The Yjs token for one entity, refreshed before it expires. */
export const yjsTokenQueryOptions = (params: { entityType: ProductEntityType; entityId: string; tenantId: string; organizationId: string }) =>
  queryOptions({
    queryKey: yjsTokenKeys.entity(params.entityType, params.entityId),
    queryFn: async () => {
      const { entityType, entityId, tenantId, organizationId } = params;
      const res = await getYjsToken({ path: { tenantId, organizationId }, query: { entityType, entityId } });
      return res.token;
    },
    staleTime: YJS_TOKEN_REFETCH_MS,
    refetchInterval: YJS_TOKEN_REFETCH_MS,
    refetchIntervalInBackground: true,
    // Overrides the app-wide `false`: backgrounded tabs throttle the interval, so refetch on focus when stale.
    refetchOnWindowFocus: true,
    retry: (count, error) => !yjsTokenRefusal(error) && count < 3,
    // A bearer token, never persisted; no global error toast, since collaborative mode stays disabled on failure.
    meta: { persist: false, suppressGlobalErrorToast: true },
  });
