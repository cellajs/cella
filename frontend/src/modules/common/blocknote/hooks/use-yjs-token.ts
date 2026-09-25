import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { ProductEntityType } from 'shared';
import { isYjsTokenRefusal, yjsTokenQueryOptions } from '~/modules/common/blocknote/query';
import { useUserStore, yjsTokenKey } from '~/modules/user/user-store';

/**
 * Keeps one entity's Yjs token in the user store, where the non-React connection layer reads it, while `enabled`.
 * `refused` means the backend will not issue one (no update access, or the entity is gone): edit without the relay.
 */
export function useYjsToken(params: {
  entityType: ProductEntityType;
  entityId: string;
  tenantId: string;
  organizationId: string;
  enabled: boolean;
}) {
  const { enabled, ...scope } = params;
  const setYjsToken = useUserStore((s) => s.setYjsToken);
  const tokenKey = yjsTokenKey(scope.entityType, scope.entityId);
  const { data: token, error } = useQuery({ ...yjsTokenQueryOptions(scope), enabled });
  const refused = isYjsTokenRefusal(error);

  // A refusal wins over a cached token, so revoked access disables collaborative mode.
  useEffect(() => {
    if (refused) setYjsToken(tokenKey, null);
    else if (token) setYjsToken(tokenKey, token);
  }, [token, refused, tokenKey, setYjsToken]);

  return { token: refused ? undefined : token, refused };
}
