import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { yjsTokenQueryOptions, yjsTokenRefusal } from '~/modules/common/blocknote/query';
import { useUserStore, yjsTokenKey } from '~/modules/user/user-store';
import type { YjsDocScope } from '~/query/local-user-db';

/**
 * Keeps one entity's Yjs token in the user store, where the non-React connection layer reads it, while `enabled`, and
 * reports a {@link yjsTokenRefusal} as `denied` (view only) or `deleted`.
 */
export function useYjsToken({ enabled, ...scope }: YjsDocScope & { enabled: boolean }) {
  const setYjsToken = useUserStore((state) => state.setYjsToken);
  const tokenKey = yjsTokenKey(scope.entityType, scope.entityId);
  const { data: token, error } = useQuery({ ...yjsTokenQueryOptions(scope), enabled });
  const refusal = yjsTokenRefusal(error);

  // A refusal wins over a cached token, so revoked access or a deletion disables collaborative mode.
  useEffect(() => {
    if (refusal) setYjsToken(tokenKey, null);
    else if (token) setYjsToken(tokenKey, token);
  }, [token, refusal, tokenKey, setYjsToken]);

  return { token: refusal ? undefined : token, denied: refusal === 'denied', deleted: refusal === 'deleted' };
}
