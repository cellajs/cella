import type { StreamSignal } from 'sdk';
import { hierarchy } from 'shared';
import { isRecord } from 'shared/utils/as-record';
import { getEntityQueryKeys, hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { queryClient } from '~/query/query-client';
import { invalidateChannelList } from '~/query/realtime/membership-ops';

/**
 * Refetches where shown, else marks, the channel lists and the details of a channel whose archived state changed and
 * of the channels inside it, which an archive can take along: the menu, the channel's page and `useCan` read the flag
 * from them.
 */
export function invalidateArchivedChannel(channelId: string): void {
  for (const channelType of hierarchy.channelTypes) {
    if (channelType === 'organization') continue;
    invalidateChannelList(channelType);
    if (!hasEntityQueryKeys(channelType)) continue;
    queryClient.invalidateQueries({
      queryKey: getEntityQueryKeys(channelType).detail.base,
      predicate: ({ state }) => isRecord(state.data) && hierarchy.isAtOrInside(channelType, state.data, channelId),
      refetchType: 'active',
    });
  }
}

/** A channel the user reads was archived or unarchived, by anyone, from any tab. */
export function handleChannelArchived({ subjectId }: StreamSignal): void {
  if (subjectId) invalidateArchivedChannel(subjectId);
}
