import type { MembershipBase } from 'sdk';
import { appConfig, type ChannelEntityType } from 'shared';
import type { ContextRole } from 'shared/tools-config';
import type { EnrichedChannel } from '~/modules/entities/types';

/**
 * Every context-role pair the actor holds anywhere, as `'channelType.role'` pairs. Used by
 * entity-less placement consumers (the system panel, and future menu/profile surfaces) to match
 * `visibleTo` without an ancestor chain to walk.
 */
export function heldContextRoles(memberships: MembershipBase[]): ContextRole[];
/**
 * Context-role pairs the actor holds for a channel entity: their membership role on the entity
 * itself plus roles on any ancestor channel, as `'channelType.role'` pairs. Pure lookup over the
 * ancestor chain (no role projection); used for placement `visibleTo` matching.
 */
export function heldContextRoles(entity: EnrichedChannel, memberships: MembershipBase[]): ContextRole[];
export function heldContextRoles(
  entityOrMemberships: EnrichedChannel | MembershipBase[],
  maybeMemberships?: MembershipBase[],
): ContextRole[] {
  // Entity-less form: union of every pair the actor holds, with no ancestor-chain scoping.
  if (Array.isArray(entityOrMemberships)) {
    const globalPairs = new Set<ContextRole>();
    for (const membership of entityOrMemberships) {
      globalPairs.add(`${membership.channelType}.${membership.role}`);
    }
    return [...globalPairs];
  }

  const entity = entityOrMemberships;
  const memberships = maybeMemberships ?? [];
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
