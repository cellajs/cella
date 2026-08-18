import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
// biome-ignore lint/style/noRestrictedImports: runtime token fetcher consumed by the Yjs provider; query options live here because they're tightly coupled to user-store side effects.
import { getYjsToken } from 'sdk';
import { appConfig, type ProductEntityType } from 'shared';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { ApiError } from '~/lib/api';
import { useUserStore, yjsTokenKey } from '~/modules/user/user-store';

const TOKEN_REFETCH_MS = 25 * 60 * 1000; // Refetch at 25min (TTL is 30min)

/** Maintains a context-scoped Yjs auth token in the user store; render per context so the token is ready before an editor opens. */
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
    // Overrides the app-wide `false`: backgrounded tabs throttle the interval, so refetch on focus when stale.
    refetchOnWindowFocus: true,
    retry: (count, error) => {
      if (error instanceof ApiError && error.status === 403) return false;
      return count < 3;
    },
    // Suppress the global error toast; collaborative mode stays disabled on failure.
    meta: { suppressGlobalErrorToast: true },
  });

  // The non-React Yjs connection layer reads the store; a 403 wins over a cached token so access denial disables collaborative mode.
  useEffect(() => {
    if (error instanceof ApiError && error.status === 403) setYjsToken(tokenKey, null);
    else if (token) setYjsToken(tokenKey, token);
  }, [token, error, tokenKey, setYjsToken]);

  return null;
}
