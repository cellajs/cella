import type { ActivityEventWithEntity } from '#/sync/activity-bus';
import type { PublicPageSubscriber } from './types';

/**
 * Check if a public subscriber is allowed to receive this event.
 * Pure function - no permission check since it's public.
 *
 * Note: No cursor comparison - nanoid strings are not ordered.
 * Cursor is only used for catch-up queries, not live filtering.
 */
export function canReceivePublicPageEvent(_subscriber: PublicPageSubscriber, event: ActivityEventWithEntity): boolean {
  // Only pages
  if (event.entityType !== 'page') return false;

  // Must have entity ID
  if (!event.entityId) return false;

  return true;
}
