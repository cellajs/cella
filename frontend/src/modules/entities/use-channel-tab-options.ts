import { useQuery } from '@tanstack/react-query';
import type { ActorRef } from 'sdk';
import type { EntityActionType, EntityType } from 'shared';
import type { ToolsConfig } from 'shared/tools-config';
import type { PlacementGrant } from '~/lib/placements';
import type { NavTabOptions } from '~/modules/common/page/tab-nav';
import { heldContextRoles } from '~/modules/entities/context-roles';
import type { EnrichedChannel } from '~/modules/entities/types';
import { type CanRow, canAccess, currentAccess, useCan } from '~/modules/entities/use-can';
import { useLtiTabs } from '~/modules/lti-platform/lti-tabs';
import { myMembershipsQueryOptions } from '~/modules/me/query';

/**
 * The grants a channel's tabs gate on: `update` (settings), which an archived channel keeps for unarchiving, and
 * `people` (members). `can` answers without the archive veto.
 */
export const channelTabGrants = (
  can: (action: EntityActionType, entityType: EntityType, row: CanRow) => boolean,
  channel: CanRow,
): PlacementGrant[] => [
  ...(can('update', channel.entityType, channel) ? (['update'] as const) : []),
  ...(can('read', 'user', channel) ? (['people'] as const) : []),
];

/** {@link channelTabGrants} before a route loads, by the memberships it reads; undefined where they cannot be read. */
export async function loadChannelTabGrants(channel: CanRow): Promise<PlacementGrant[] | undefined> {
  const access = await currentAccess();
  return access ? channelTabGrants((action, entityType, row) => canAccess(access, action, entityType, row), channel) : undefined;
}

/** A channel as its tabs gate on it; a list row may come without its writer or its stored arrangement. */
type TabsChannel = EnrichedChannel & { createdBy?: ActorRef | null; toolsConfig?: ToolsConfig };

/**
 * What a channel's page tabs resolve with, on its page bar and in the menu alike: its grants, the context roles held over
 * it, its stored arrangement and the tabs of the LTI tools placed in it.
 */
export function useChannelTabOptions(channel: TabsChannel): NavTabOptions {
  const can = useCan({ ignoreArchive: true });
  const { data: myMemberships } = useQuery(myMembershipsQueryOptions());
  const { tabs } = useLtiTabs(channel);

  return {
    grants: channelTabGrants(can, channel),
    pairs: heldContextRoles(channel, myMemberships?.results ?? []),
    slotConfig: channel.toolsConfig?.[`${channel.entityType}.tabs`],
    dataTabs: tabs,
  };
}
