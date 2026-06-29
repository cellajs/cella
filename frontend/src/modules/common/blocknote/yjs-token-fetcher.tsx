import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
// biome-ignore lint/style/noRestrictedImports: runtime token fetcher consumed by the Yjs provider — query options live here because they're tightly coupled to user-store side effects.
import { getYjsToken } from 'sdk';
import { appConfig } from 'shared';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { ApiError } from '~/lib/api';
import { useUserStore, yjsTokenKey } from '~/modules/user/user-store';

const TOKEN_REFETCH_MS = 25 * 60 * 1000; // Refetch at 25min (TTL is 30min)

/**
 * Fetches and maintains a context-scoped Yjs auth token in the user store.
 * Should be rendered per context (e.g. per project or org layout) so the
 * token is ready before a user opens an editor.
 *
 * Also refetches immediately on `visibilitychange` (tab wake / laptop resume)
 * because `setInterval`-based refetch is throttled or paused by browsers
 * when the page is backgrounded or the device sleeps.
 */
export function YjsTokenFetcher({
  entityType,
  tenantId,
  organizationId,
}: {
  entityType: string;
  tenantId: string;
  organizationId: string;
}) {
  const setYjsToken = useUserStore((s) => s.setYjsToken);
  const queryClient = useQueryClient();
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
    retry: (count, error) => {
      if (error instanceof ApiError && error.status === 403) return false;
      return count < 3;
    },
    // Silently suppress global error toast — collaborative mode just stays disabled on failure
    meta: { suppressGlobalErrorToast: true },
  });

  // Clear the token in the user store when access is denied (403).
  useEffect(() => {
    if (error instanceof ApiError && error.status === 403) setYjsToken(tokenKey, null);
  }, [error, tokenKey, setYjsToken]);

  // Sync token to store whenever query data changes (including cached returns).
  useEffect(() => {
    if (token) setYjsToken(tokenKey, token);
  }, [token, tokenKey, setYjsToken]);

  // Immediately refetch token when page becomes visible again (wake from sleep / tab focus).
  useEffect(() => {
    if (!appConfig.yjsUrl) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        queryClient.invalidateQueries({ queryKey: ['yjs', 'token', entityType, tenantId] });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [queryClient, entityType, tenantId]);

  return null;
}
