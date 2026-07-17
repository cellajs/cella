import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
// biome-ignore lint/style/noRestrictedImports: runtime token fetcher consumed by the Yjs provider; query options live here because they're tightly coupled to user-store side effects.
import { getYjsToken } from 'sdk';
import { appConfig, type ProductEntityType } from 'shared';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { ApiError } from '~/lib/api';
import { useUserStore, yjsTokenKey } from '~/modules/user/user-store';

const TOKEN_REFETCH_MS = 25 * 60 * 1000; // Refetch at 25min (TTL is 30min)

/**
 * Fetches and maintains a context-scoped Yjs auth token in the user store; render per context (project/org
 * layout) so the token is ready before an editor opens.
 */
export function YjsTokenFetcher({
  entityType,
  tenantId,
  organizationId,
}: {
  entityType: ProductEntityType;
  tenantId: string;
  organizationId: string;
}) {
  const setYjsToken = useUserStore((s) => s.setYjsToken);
  const isOnline = useOnlineManager();
  const tokenKey = yjsTokenKey(entityType, tenantId);

  const { data: token, error } = useQuery({
    queryKey: ['yjs', 'token', entityType, tenantId],
    queryFn: async () => {
      const res = await getYjsToken({
        query: { entityType, tenantId, organizationId },
      });
      return res.token;
    },
    enabled: !!appConfig.yjsUrl && isOnline,
    staleTime: TOKEN_REFETCH_MS,
    refetchInterval: TOKEN_REFETCH_MS,
    refetchIntervalInBackground: true,
    // Override the app-wide `false`: browsers throttle or pause timers in backgrounded tabs, so on tab
    // wake / resume the interval may not have fired. This refetches on visibility only when stale (>25min).
    refetchOnWindowFocus: true,
    retry: (count, error) => {
      if (error instanceof ApiError && error.status === 403) return false;
      return count < 3;
    },
    // Silently suppress global error toast; collaborative mode stays disabled on failure.
    meta: { suppressGlobalErrorToast: true },
  });

  // Sync query state into the user store, where the non-React Yjs connection layer reads it
  // (including cached returns). A 403 wins over stale cached data: access denied must disable
  // collaborative mode even when an old token is still in the query cache.
  useEffect(() => {
    if (error instanceof ApiError && error.status === 403) setYjsToken(tokenKey, null);
    else if (token) setYjsToken(tokenKey, token);
  }, [token, error, tokenKey, setYjsToken]);

  return null;
}
