import type { SystemRole } from 'shared';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import type { CursoredSubscriber } from '#/sync/stream';

/**
 * App stream subscriber (authenticated).
 * Receives all events (memberships, product entities, org) via org channels.
 */
export interface AppStreamSubscriber extends CursoredSubscriber {
  /** User ID */
  userId: string;
  /** User's hashed session token (for signing cache tokens) */
  sessionToken: string;
  /** Set of org IDs user belongs to (for filtering org events) */
  orgIds: Set<string>;
  /** User's system role for permission bypass (null if no elevated role) */
  userSystemRole: SystemRole | null;
  /** User's memberships for permission checks on product entities */
  memberships: MembershipBaseModel[];
}

/**
 * Channel key for org-scoped events.
 * All events (memberships, product entities, org updates) flow through org channels.
 */
export function orgChannel(orgId: string): string {
  return `org:${orgId}`;
}
