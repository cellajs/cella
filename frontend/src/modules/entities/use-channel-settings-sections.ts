import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { appConfig, type ChannelEntityType } from 'shared';
import type { ToolsConfig } from 'shared/tools-config';
import {
  type ChannelEntityContext,
  getSlotDescriptors,
  type PlacementDescriptor,
  resolvePlacementList,
} from '~/lib/placements';
import { heldContextRoles } from '~/modules/entities/context-roles';
import { useResolveCan } from '~/modules/entities/use-resolve-can';
import { myMembershipsQueryOptions } from '~/modules/me/query';

export type ChannelSettingsHost<C extends ChannelEntityType> = ChannelEntityContext<C> & {
  entityType: C;
  toolsConfig?: ToolsConfig;
};

export type ChannelSettingsSection<C extends ChannelEntityType> = PlacementDescriptor & {
  order: number;
  render: (entity: ChannelEntityContext<C>) => ReactNode;
};

/**
 * Resolves the `${channelType}.settings` slot tools, arranged by app overrides and the entity's
 * stored `toolsConfig`, gated on the actor's grants (`requires`) and context-role pairs (`visibleTo`).
 */
export function useChannelSettingsSections<C extends ChannelEntityType>(
  entity: ChannelSettingsHost<C>,
): ChannelSettingsSection<C>[] {
  const channelType = entity.entityType;
  const slot = `${channelType}.settings`;

  // Grants: every entity action the actor holds on this channel, resolved per row
  const resolveCan = useResolveCan();
  const can = entity.can?.[channelType];
  const grants = appConfig.entityActions.filter((action) => resolveCan(can?.[action], entity.createdBy));

  const { data: myMemberships } = useQuery(myMembershipsQueryOptions());
  const pairs = heldContextRoles(entity, myMemberships?.items ?? []);

  // Cast: registered settings tools carry a render the descriptor type erases
  const tools = getSlotDescriptors(slot).map((tool) => ({
    ...tool,
    order: tool.order ?? 50,
  })) as unknown as ChannelSettingsSection<C>[];

  return resolvePlacementList(slot, tools, { grants, pairs, slotConfig: entity.toolsConfig?.[slot] });
}
