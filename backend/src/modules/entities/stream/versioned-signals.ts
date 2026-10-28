import type { EntityType, ResourceType } from 'shared';

/**
 * Versioned signals, by the tracked table whose changes move them. For every change of such a table the CDC worker
 * adds 1 to `s:<type>` on the counter row of the change's organization, and catchup returns those versions, so a client
 * that missed the live signal still runs its handler once. The worker reads this file, so it imports nothing of the API.
 */
export const versionedSignals: Partial<Record<EntityType | ResourceType, string[]>> = {
  membership: ['membership.changed'],
  // An invitation is a membership not yet accepted: the member lists that show it change with it.
  inactive_membership: ['membership.changed'],
};
