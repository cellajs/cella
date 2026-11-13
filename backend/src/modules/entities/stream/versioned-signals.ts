import { type ActivityAction, type EntityHierarchy, type EntityType, hierarchy, type ResourceType } from 'shared';
import type { StreamSignalType } from 'shared/stream-signal-types';

/** A signal whose version the changes of a tracked table move. */
export interface VersionedSignal {
  type: StreamSignalType;
  /** The changes that move it; every change when absent. */
  actions?: ActivityAction[];
  /** Whether the live signal names the changed channel row and goes to that channel's readers; without it, to the organization's. */
  namesRow?: boolean;
}

const tableSignals: Partial<Record<EntityType | ResourceType, VersionedSignal[]>> = {
  membership: [{ type: 'membership.changed' }],
  // An invitation is a membership not yet accepted: the member lists that show it change with it.
  invitation: [{ type: 'membership.changed' }],
};

/**
 * The rows below a deleted channel leave by foreign key cascade, and the worker sends no change for them (see
 * `TransactionBuffer`): this signal tells the channel's readers to drop what they hold at and under it. A channel deleted
 * with an ancestor moves none (`flushSignals`): the root's signal covers the subtree. An organization is no such
 * channel: its delete follows the archive of its tenant, which ends its members' streams.
 */
const channelDeleted: VersionedSignal = { type: 'channel.deleted', actions: ['delete'], namesRow: true };

/**
 * The versioned signals a change moves. For each, the CDC worker adds 1 to `s:<type>` on the counter row of the
 * change's organization, and catchup returns those versions, so a client that missed the live signal still runs its
 * handler once. The worker reads this file, so it imports nothing of the API.
 * @returns The signals, none for a table without one.
 */
export function versionedSignalsOf(table: EntityType | ResourceType, action: ActivityAction, h: EntityHierarchy = hierarchy): VersionedSignal[] {
  const declared = [...(tableSignals[table] ?? []), ...(h.isChannel(table) && table !== 'organization' ? [channelDeleted] : [])];
  return declared.filter(({ actions }) => !actions || actions.includes(action));
}
