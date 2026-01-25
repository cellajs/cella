import type { SystemRole } from 'config';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import type { CursoredSubscriber } from '#/sync/stream';

/**
 * User-scoped stream subscriber.
 * Receives membership events AND product entity events for all user's orgs.
 */
export interface UserStreamSubscriber extends CursoredSubscriber {
  /** User ID */
  userId: string;
  /** Set of org IDs user belongs to (for filtering org events) */
  orgIds: Set<string>;
  /** User's system role for permission bypass */
  userSystemRole: SystemRole | 'user';
  /** User's memberships for permission checks on product entities */
  memberships: MembershipBaseModel[];
}

/**
 * Channel key for user-specific events (memberships).
 */
export function userChannel(userId: string): string {
  return `user:${userId}`;
}

/**
 * Channel key for org-specific events (product entities).
 * Re-exported here for convenience when registering user subscribers on org channels.
 */
export function orgChannel(orgId: string): string {
  return `org:${orgId}`;
}
