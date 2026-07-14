import { appConfig } from 'shared';
import { type ActivityBatchRow, getEventData } from '#/lib/activity-bus';
import { signCacheToken } from '#/middlewares/entity-cache/token-signer';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { checkPermission } from '#/permissions';
import { buildSubject } from '#/permissions/build-subject';
import { log } from '#/utils/logger';
import type { CursoredSubscriber } from '../stream';
import { isMembershipEvent } from '../stream/build-message';
import { createStreamDispatcher } from '../stream/dispatcher';
import type { AppStreamEvent, AppStreamProductEvent } from '../stream/types';

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

/** The membership + admin state a dispatch decision needs (test-friendly subset). */
export type SubscriberAccess = Pick<AppStreamSubscriber, 'userId' | 'isSystemAdmin' | 'memberships'>;

/**
 * SSE must mirror API read visibility: can this subscriber read the event's row?
 *
 * Runs the SAME engine as API reads (`checkPermission`) with the SAME inputs — the
 * event carries the full row (REPLICA IDENTITY FULL), which row conditions and public
 * grants evaluate per subscriber. Rows are self-describing, so no second row is ever
 * needed. Fail-closed on malformed events.
 *
 * This decision doubles as cacheToken issuance (a signed token is a read capability
 * `appCache` honors without re-running predicates), so over-notifying is never OK.
 *
 * Forks may add product rules here (e.g. author-only draft rows) before the engine
 * check — concepts the engine has no policy vocabulary for.
 *
 * Exported so the parity property test can assert: SQL predicate ≍ checkPermission ≍
 * this function.
 */
export function canReceiveEntityEvent(subscriber: SubscriberAccess, event: AppStreamProductEvent): boolean {
  const row = (event.rowData ?? undefined) as Record<string, unknown> | undefined;

  try {
    const subject = buildSubject(event.entityType, event, {
      id: event.subjectId ?? undefined,
      createdBy: (row?.createdBy as string | null | undefined) ?? undefined,
      row,
    });

    return checkPermission(subscriber.memberships, 'read', subject, {
      userId: subscriber.userId,
      isSystemAdmin: subscriber.isSystemAdmin,
    }).isAllowed;
  } catch {
    log.error('Malformed stream event: missing ancestor scope', {
      entityType: event.entityType,
      subjectId: event.subjectId,
    });
    return false;
  }
}

/**
 * Rebase a product event onto one of its batch rows: subjectId and every CONTEXT id
 * column come from the row itself — rows are self-describing, which also makes
 * re-parenting evaluate correctly.
 */
const rowScopedEvent = (event: AppStreamProductEvent, rowData: Record<string, unknown>): AppStreamProductEvent => {
  const overrides: Record<string, unknown> = { rowData };
  if (typeof rowData.id === 'string') overrides.subjectId = rowData.id;
  for (const channelType of appConfig.channelEntityTypes) {
    const columnKey = appConfig.entityIdColumnKeys[channelType];
    if (columnKey in rowData) overrides[columnKey] = rowData[columnKey];
  }
  return { ...event, ...overrides } as AppStreamProductEvent;
};

/** The rows an event speaks for: per-row batch payloads, or the single event row. */
const eventRows = (event: AppStreamProductEvent): ActivityBatchRow[] =>
  event.batchRows?.length ? event.batchRows : [{ rowData: event.rowData as Record<string, unknown> }];

/**
 * Dispatch activity events to matching app stream subscribers.
 *
 * All events route through org channels:
 * - Membership events → filtered to affected user
 * - Product entity events → per-ROW read permission (mirrors the API): a subscriber is
 *   pinged iff they can read at least one row the event speaks for.
 */
export const dispatchToAppStream = createStreamDispatcher<AppStreamSubscriber, AppStreamEvent>({
  getChannel: (event) => `org:${event.organizationId}`,
  shouldReceive: (subscriber, event) => {
    // For membership events, check if user is the subject
    if (isMembershipEvent(event)) {
      const membership = getEventData(event, 'membership');
      return membership?.userId === subscriber.userId;
    }

    if (!subscriber.organizationIds.has(event.organizationId)) return false;

    return eventRows(event).some(({ rowData }) =>
      canReceiveEntityEvent(subscriber, rowData === event.rowData ? event : rowScopedEvent(event, rowData)),
    );
  },
  transformNotification: (notification, subscriber) => {
    // Sign cache token per subscriber session
    if (notification.cacheToken) {
      return { ...notification, cacheToken: signCacheToken(notification.cacheToken, subscriber.sessionToken) };
    }
    return notification;
  },
});
