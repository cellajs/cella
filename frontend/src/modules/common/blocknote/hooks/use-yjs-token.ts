import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { ProductEntityType } from 'shared';
import { yjsTokenQueryOptions, yjsTokenRefusal } from '~/modules/common/blocknote/query';
import { useUserStore, yjsTokenKey } from '~/modules/user/user-store';

/**
 * Keeps one entity's Yjs token in the user store, where the non-React connection layer reads it, while `enabled`.
 * The backend will not issue one when the caller may not edit the entity (`refused`, a 403: view only) or when the
 * entity is gone (`deleted`, a 404).
 */
export function useYjsToken(params: { entityType: ProductEntityType; entityId: string; tenantId: string; organizationId: string; enabled: boolean }) {
  const { enabled, ...scope } = params;
  const setYjsToken = useUserStore((s) => s.setYjsToken);
  const tokenKey = yjsTokenKey(scope.entityType, scope.entityId);
  const { data: token, error } = useQuery({ ...yjsTokenQueryOptions(scope), enabled });
  const refusal = yjsTokenRefusal(error);

  // A refusal wins over a cached token, so revoked access or a deletion disables collaborative mode.
  useEffect(() => {
    if (refusal) setYjsToken(tokenKey, null);
    else if (token) setYjsToken(tokenKey, token);
  }, [token, refusal, tokenKey, setYjsToken]);

  return { token: refusal ? undefined : token, refused: refusal === 'refused', deleted: refusal === 'deleted' };
}
