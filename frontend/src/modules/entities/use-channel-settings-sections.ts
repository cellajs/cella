import { useQuery } from '@tanstack/react-query';
import { appConfig, type ChannelEntityType } from 'shared';
import type { ToolsConfig } from 'shared/tools-config';
import {
  type ChannelEntityContext,
  type ChannelSettingsToolFor,
  getChannelSettingsTools,
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

/**
 * Resolves a channel entity's final settings section list: the `${channelType}.settings` slot's
 * registered tools, arranged by app overrides and the entity's stored `toolsConfig`, gated on the
 * actor's resolved action grants (`requires`) and held context-role pairs (`visibleTo`). Headless
 * by design: this hook owns all resolution, while presentation (page, sheet, dialog, tab bar)
 * stays a consumer-side map over the returned sections.
 */
export function useChannelSettingsSections<C extends ChannelEntityType>(
  entity: ChannelSettingsHost<C>,
): (ChannelSettingsToolFor<C> & { order: number })[] {
  const channelType = entity.entityType;
  const slot = `${channelType}.settings`;

  // Grants: every entity action the actor holds on this channel, resolved per row
  const resolveCan = useResolveCan();
  const can = entity.can?.[channelType];
  const grants = appConfig.entityActions.filter((action) => resolveCan(can?.[action], entity.createdBy));

  const { data: myMemberships } = useQuery(myMembershipsQueryOptions());
  const pairs = heldContextRoles(entity, myMemberships?.items ?? []);

  return resolvePlacementList(slot, getChannelSettingsTools(channelType), {
    grants,
    pairs,
    slotConfig: entity.toolsConfig?.[slot],
  });
}
