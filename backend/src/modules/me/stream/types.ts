import type { SystemRole } from 'config';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import type { CursoredSubscriber } from '#/sync/stream';

/**
 * User-scoped stream subscriber.
 * Receives all events (memberships, product entities, org) via org channels.
 */
export interface AppStreamSubscriber extends CursoredSubscriber {
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
 * Channel key for org-scoped events.
 * All events (memberships, product entities, org updates) flow through org channels.
 */
export function orgChannel(orgId: string): string {
  return `org:${orgId}`;
}
