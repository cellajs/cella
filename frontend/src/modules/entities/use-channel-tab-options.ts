import { useQuery } from '@tanstack/react-query';
import type { ActorRef } from 'sdk';
import type { ToolsConfig } from 'shared/tools-config';
import type { ResolvePlacementOptions } from '~/lib/placements';
import { heldContextRoles } from '~/modules/entities/context-roles';
import type { EnrichedChannel } from '~/modules/entities/types';
import { useResolveCan } from '~/modules/entities/use-resolve-can';
import { myMembershipsQueryOptions } from '~/modules/me/query';

/** A channel as its tabs gate on it; a list row may come without its writer or its stored arrangement. */
type TabsChannel = EnrichedChannel & { createdBy?: ActorRef | null; toolsConfig?: ToolsConfig | null };

/** What a channel's page tabs resolve with, on its page bar and in the menu alike: the update grant, the context roles held over it, its stored arrangement. */
export function useChannelTabOptions(channel: TabsChannel): ResolvePlacementOptions {
  const resolveCan = useResolveCan();
  const { data: myMemberships } = useQuery(myMembershipsQueryOptions());

  // Tabs declaring `requires: 'update'` (settings) hide without it
  const canUpdate = resolveCan(channel.can?.[channel.entityType]?.update, channel.createdBy);

  return {
    grants: canUpdate ? ['update'] : [],
    pairs: heldContextRoles(channel, myMemberships?.items ?? []),
    slotConfig: channel.toolsConfig?.[`${channel.entityType}.tabs`],
  };
}
