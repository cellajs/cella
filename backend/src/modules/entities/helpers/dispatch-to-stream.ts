import { getEventData } from '#/lib/activity-bus';
import { signCacheToken } from '#/middlewares/entity-cache/token-signer';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { checkPermission } from '#/permissions';
import { buildSubject } from '#/permissions/build-subject';
import { log } from '#/utils/logger';
import type { CursoredSubscriber } from '../stream';
import { createStreamDispatcher } from '../stream/dispatcher';
import type { AppStreamEvent } from '../stream/types';

/**
 * App stream subscriber (authenticated).
 * Receives all events (memberships, product entities, org) via org channels.
 */
export interface AppStreamSubscriber extends CursoredSubscriber {
  userId: string;
  sessionToken: string;
  organizationIds: Set<string>;
  isSystemAdmin: boolean;
  memberships: MembershipBaseModel[];
}

/**
 * Dispatch activity events to matching app stream subscribers.
 *
 * All events route through org channels:
 * - Membership events → filtered to affected user
 * - Product entity events → filtered by read permission
 */
export const dispatchToAppStream = createStreamDispatcher<AppStreamSubscriber, AppStreamEvent>({
  getChannel: (event) => `org:${event.organizationId}`,
  shouldReceive: (subscriber, event) => {
    // For membership events, check if user is the subject
    if (event.resourceType === 'membership') {
      const membership = getEventData(event, 'membership');
      return membership?.userId === subscriber.userId;
    }

    // For product entity events, check read permission using full ancestor context
    if (!subscriber.organizationIds.has(event.organizationId)) return false;

    // Build permission subject with all ancestor context IDs from the event
    try {
      const subject = buildSubject(event.entityType, event, { id: event.subjectId });

      return checkPermission(subscriber.memberships, 'read', subject, { isSystemAdmin: subscriber.isSystemAdmin })
        .isAllowed;
    } catch {
      log.error('Malformed stream event: missing ancestor scope', {
        entityType: event.entityType,
        subjectId: event.subjectId,
      });
      return false;
    }
  },
  transformNotification: (notification, subscriber) => {
    // Sign cache token per subscriber session
    if (notification.cacheToken) {
      return { ...notification, cacheToken: signCacheToken(notification.cacheToken, subscriber.sessionToken) };
    }
    return notification;
  },
});
