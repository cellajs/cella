import type { RealtimeEntityType } from 'config';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import type { BaseStreamSubscriber } from '#/sync/stream';

/**
 * Organization-scoped stream subscriber.
 * Includes memberships for permission checks.
 */
export interface OrgStreamSubscriber extends BaseStreamSubscriber {
  /** User ID of the subscriber */
  userId: string;
  /** Organization ID (also used as part of indexKey) */
  orgId: string;
  /** User's system role (admin bypasses ACLs) */
  userSystemRole: string | null;
  /** User's memberships for permission checks */
  memberships: MembershipBaseModel[];
  /** Last activity ID cursor (skip activities <= cursor) */
  cursor: string | null;
  /** Entity types to filter (empty = all realtime entities) */
  entityTypes: RealtimeEntityType[];
}

/**
 * Create index key for org-scoped subscribers.
 */
export function orgIndexKey(orgId: string): string {
  return `org:${orgId}`;
}
