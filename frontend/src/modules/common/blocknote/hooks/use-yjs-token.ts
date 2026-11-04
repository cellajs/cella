import { useQuery } from '@tanstack/react-query';
import type { YjsDocScope } from 'shared';
import { yjsTokenQueryOptions, yjsTokenRefusal } from '~/modules/common/blocknote/query';

/**
 * One entity's Yjs token while `enabled`, read by the connection layer from the same query, and a {@link yjsTokenRefusal}
 * as `denied` (view only) or `deleted`.
 */
export function useYjsToken({ enabled, ...scope }: YjsDocScope & { enabled: boolean }) {
  const { data: token, error } = useQuery({ ...yjsTokenQueryOptions(scope), enabled });
  const refusal = yjsTokenRefusal(error);
  // A refusal wins over a cached token, so revoked access or a deletion disables collaborative mode.
  return { token: refusal ? undefined : token, denied: refusal === 'denied', deleted: refusal === 'deleted' };
}
