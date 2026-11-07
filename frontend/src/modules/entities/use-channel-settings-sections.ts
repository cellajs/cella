import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { appConfig, type ChannelEntityType } from 'shared';
import type { ToolsConfig } from 'shared/tools-config';
import { type ChannelEntityContext, getTools, type PlacementDescriptor, resolvePlacementList } from '~/lib/placements';
import { heldContextRoles } from '~/modules/entities/context-roles';
import { useCan } from '~/modules/entities/use-can';
import { myMembershipsQueryOptions } from '~/modules/me/query';

export type ChannelSettingsHost<C extends ChannelEntityType> = ChannelEntityContext<C> & { entityType: C; toolsConfig: ToolsConfig };

export type ChannelSettingsSection<C extends ChannelEntityType> = PlacementDescriptor & {
  order: number;
  render: (entity: ChannelEntityContext<C>) => ReactNode;
};

/** The `${channelType}.settings` tools, ordered by the app config and the row's `toolsConfig`, gated on grants and context-role pairs. */
export function useChannelSettingsSections<C extends ChannelEntityType>(entity: ChannelSettingsHost<C>): ChannelSettingsSection<C>[] {
  const channelType = entity.entityType;
  const slot: `${C}.settings` = `${channelType}.settings`;

  const can = useCan();
  const grants = appConfig.entityActions.filter((action) => can(action, channelType, entity));

  const { data: myMemberships } = useQuery(myMembershipsQueryOptions());
  const pairs = heldContextRoles(entity, myMemberships?.results ?? []);

  // Cast: registered settings tools carry a render the descriptor type erases
  const tools = getTools(slot) as ChannelSettingsSection<C>[];

  return resolvePlacementList(slot, tools, { grants, pairs, slotConfig: entity.toolsConfig[slot] });
}
