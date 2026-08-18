import type { MembershipBase } from 'sdk';
import { appConfig, type ChannelEntityType } from 'shared';
import type { ContextRole } from 'shared/tools-config';
import type { EnrichedChannel } from '~/modules/entities/types';

/** `'channelType.role'` pairs the actor holds on the entity and its ancestors, for `visibleTo` matching. */
export function heldContextRoles(entity: EnrichedChannel, memberships: MembershipBase[]): ContextRole[] {
  const record: Record<string, unknown> = entity;
  const idsByType: Partial<Record<ChannelEntityType, string>> = { [entity.entityType]: entity.id };
  for (const channelType of appConfig.channelEntityTypes) {
    const value = record[appConfig.entityIdColumnKeys[channelType]];
    if (typeof value === 'string') idsByType[channelType] ??= value;
  }

  const pairs = new Set<ContextRole>();
  for (const membership of memberships) {
    if (idsByType[membership.channelType] === membership.channelId) {
      pairs.add(`${membership.channelType}.${membership.role}`);
    }
  }
  return [...pairs];
}
