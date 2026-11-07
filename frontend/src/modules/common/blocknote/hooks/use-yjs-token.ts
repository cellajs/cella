import { useQuery } from '@tanstack/react-query';
import type { YjsDocScope } from 'shared';
import { yjsTokenQueryOptions, yjsTokenRefusal } from '~/modules/common/blocknote/query';

/** One entity's Yjs token while `enabled`, shared with the connection layer, and a {@link yjsTokenRefusal} as `denied` (view only) or `deleted`. */
export function useYjsToken({ enabled, ...scope }: YjsDocScope & { enabled: boolean }) {
  const { data: token, error } = useQuery({ ...yjsTokenQueryOptions(scope), enabled });
  const refusal = yjsTokenRefusal(error);
  // A refusal wins over a cached token, so revoked access or a deletion disables collaborative mode.
  return { token: refusal ? undefined : token, denied: refusal === 'denied', deleted: refusal === 'deleted' };
}
