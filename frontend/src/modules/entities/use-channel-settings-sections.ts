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

/** The hosting channel entity a settings consumer passes: enriched, with its stored arrangement. */
export type ChannelSettingsHost<C extends ChannelEntityType> = ChannelEntityContext<C> & {
  entityType: C;
  toolsConfig?: ToolsConfig;
};

/** A resolved settings section: descriptor plus renderer receiving the hosting channel entity. */
export type ChannelSettingsSection<C extends ChannelEntityType> = PlacementDescriptor & {
  order: number;
  render: (entity: ChannelEntityContext<C>) => ReactNode;
};

/**
 * Resolves a channel entity's final settings section list: the `${channelType}.settings` slot's
 * registered tools, arranged by app overrides and the entity's stored `toolsConfig`, gated on the
 * actor's resolved action grants (`requires`) and held context-role pairs (`visibleTo`). Headless
 * by design: this hook owns all resolution, while presentation (page, sheet, dialog, tab bar)
 * stays a consumer-side map over the returned sections.
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

  // Cast: registered settings tools carry a render the descriptor type erases; the slot key
  // guarantees this family's shape
  const tools = getSlotDescriptors(slot).map((tool) => ({
    ...tool,
    order: tool.order ?? 50,
  })) as unknown as ChannelSettingsSection<C>[];

  return resolvePlacementList(slot, tools, { grants, pairs, slotConfig: entity.toolsConfig?.[slot] });
}
