import type { MembershipBase } from 'sdk';
import { type ChannelEntityType, hierarchy } from 'shared';
import type { ContextRole } from 'shared/tools-config';
import { asRecord } from 'shared/utils/as-record';
import type { EnrichedChannel } from '~/modules/entities/types';

/** `'channelType.role'` pairs the actor holds on the entity and its ancestors, for `visibleTo` matching. */
export function heldContextRoles(entity: EnrichedChannel, memberships: MembershipBase[]): ContextRole[] {
  const idsByType: Partial<Record<ChannelEntityType, string>> = { [entity.entityType]: entity.id };
  for (const { type, id } of hierarchy.resolveNonNullAncestors(entity.entityType, asRecord(entity))) idsByType[type] = id;

  const pairs = new Set<ContextRole>();
  for (const { channelType, channelId, role } of memberships) {
    if (idsByType[channelType] === channelId) pairs.add(`${channelType}.${role}`);
  }
  return [...pairs];
}
