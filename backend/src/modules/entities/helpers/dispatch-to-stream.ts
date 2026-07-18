import { appConfig, isUnpublishedDraft } from 'shared';
import { type ActivityBatchRow, getEventData } from '#/lib/activity-bus';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { checkPermission } from '#/permissions';
import { buildSubject } from '#/permissions/build-subject';
import { log } from '#/utils/logger';
import type { CursoredSubscriber } from '../stream';
import { buildMoveOutNotification, isMembershipEvent } from '../stream/build-message';
import { createStreamDispatcher } from '../stream/dispatcher';
import { sendNotificationToSubscriber } from '../stream/send-to-subscriber';
import { streamSubscriberManager } from '../stream/subscriber-manager';
import type { AppStreamEvent, AppStreamProductEvent } from '../stream/types';

/**
 * App stream subscriber (authenticated).
 * Receives all events (memberships, product entities, org) via org channels.
 */
export interface AppStreamSubscriber extends CursoredSubscriber {
  userId: string;
  organizationIds: Set<string>;
  isSystemAdmin: boolean;
  memberships: MembershipBaseModel[];
}

/** The membership + admin state a dispatch decision needs (test-friendly subset). */
export type SubscriberAccess = Pick<AppStreamSubscriber, 'userId' | 'isSystemAdmin' | 'memberships'>;

/**
 * SSE must mirror API read visibility: can this subscriber read the event's row?
 *
 * Runs the SAME engine as API reads (`checkPermission`) with the SAME inputs. The
 * event carries the full row (REPLICA IDENTITY FULL), which row conditions and public
 * grants evaluate per subscriber. Rows are self-describing, so no second row is ever
 * needed. Fail-closed on malformed events.
 *
 * The same visibility is re-checked when a cache hit is served (`appCache` re-runs
 * `checkPermission` against the cached row), so over-notifying is never a leak here.
 *
 * Unpublished drafts (`publishedAt` null, see `shared/src/published-rows.ts`) are
 * dropped for EVERYONE, author included. This veto is fail-closed defense-in-depth:
 * the publication row filter keeps drafts out of the replication stream at the source
 * (publish arrives as INSERT, unpublish as DELETE), so a draft event here means a
 * misconfigured fork. Delta reads apply the same exclusion, so a draft is never
 * fetchable either way.
 *
 * Exported so the parity property test can assert: SQL predicate ≍ checkPermission ≍
 * this function.
 */
export function canReceiveEntityEvent(subscriber: SubscriberAccess, event: AppStreamProductEvent): boolean {
  const row = (event.rowData ?? undefined) as Record<string, unknown> | undefined;

  if (isUnpublishedDraft(row)) return false;

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
 * column come from the row itself. Rows are self-describing, which also makes
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
});

/** The (currentRow, oldRow) pairs of an event's moved rows, single or batch. */
const movedRows = (
  event: AppStreamProductEvent,
): Array<{ rowData: Record<string, unknown>; movedFrom: Record<string, unknown> }> => {
  if (event.batchRows?.length) {
    return event.batchRows
      .filter((row): row is ActivityBatchRow & { movedFrom: Record<string, unknown> } => !!row.movedFrom)
      .map((row) => ({ rowData: row.rowData, movedFrom: row.movedFrom }));
  }
  const movedFrom = event.movedFrom;
  if (movedFrom) return [{ rowData: event.rowData as Record<string, unknown>, movedFrom }];
  return [];
};

/**
 * Move-out delivery: when a row's path changed, subscribers who could read the OLD
 * location but not the new one would otherwise never learn the row left. The normal
 * notification is permission-filtered on the NEW row, and a later delta fetch is
 * permission-filtered too, so no tombstone ever reaches them. For exactly those
 * subscribers this sends an `action: 'moveOut'` notification carrying the old path;
 * the notification itself is the removal instruction.
 *
 * Subscribers who can read BOTH locations get the normal update and route the row
 * between views client-side; they are excluded here to avoid remove-then-reinsert races.
 */
export async function dispatchMoveOuts(event: AppStreamProductEvent): Promise<void> {
  const moves = movedRows(event);
  if (moves.length === 0) return;

  const subscribers = streamSubscriberManager.getByChannel<AppStreamSubscriber>(`org:${event.organizationId}`);
  if (subscribers.length === 0) return;

  for (const { rowData, movedFrom } of moves) {
    const oldEvent = rowScopedEvent(event, movedFrom);
    const newEvent = rowData === event.rowData ? event : rowScopedEvent(event, rowData);

    const eligible = subscribers.filter(
      (subscriber) =>
        subscriber.organizationIds.has(event.organizationId) &&
        canReceiveEntityEvent(subscriber, oldEvent) &&
        !canReceiveEntityEvent(subscriber, newEvent),
    );
    if (eligible.length === 0) continue;

    const notification = buildMoveOutNotification(oldEvent, movedFrom);
    const preSerialized = JSON.stringify(notification);

    await Promise.allSettled(
      eligible.map((subscriber) =>
        sendNotificationToSubscriber(subscriber, oldEvent, notification, undefined, preSerialized).catch((error) => {
          log.error('Failed to dispatch move-out', { subscriberId: subscriber.id, activityId: event.id, error });
        }),
      ),
    );
  }
}
