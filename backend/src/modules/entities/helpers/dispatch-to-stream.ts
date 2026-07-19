import { appConfig, isUnpublishedDraft, type SubjectForPermission } from 'shared';
import { type ActivityBatchRow, getEventData } from '#/lib/activity-bus';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { checkAccess } from '#/permissions';
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

/**
 * The membership + admin state a dispatch decision needs (test-friendly subset).
 * Structurally an `Access`, so subscribers feed `checkAccess` directly.
 */
export type SubscriberAccess = Pick<AppStreamSubscriber, 'userId' | 'isSystemAdmin' | 'memberships'>;

/**
 * The permission subject of one event row, subscriber-independent. Returns `null` when the
 * row is vetoed for everyone, fail-closed: an unpublished draft (`publishedAt` null, see
 * `shared/src/published-rows.ts` — defense-in-depth behind the publication row filter, the
 * author included), or a malformed ancestor scope.
 */
const rowReadSubject = (event: AppStreamProductEvent): SubjectForPermission | null => {
  const row = (event.rowData ?? undefined) as Record<string, unknown> | undefined;

  if (isUnpublishedDraft(row)) return null;

  try {
    return buildSubject(event.entityType, event, {
      id: event.subjectId ?? undefined,
      createdBy: (row?.createdBy as string | null | undefined) ?? undefined,
      row,
    });
  } catch {
    log.error('Malformed stream event: missing ancestor scope', {
      entityType: event.entityType,
      subjectId: event.subjectId,
    });
    return null;
  }
};

/**
 * SSE must mirror API read visibility: which of these subscribers can read the event's row?
 *
 * ONE `checkAccess` batch call — the engine collapses subscribers into access classes and
 * runs the policy walk once per class, with the SAME inputs as API reads. The event carries
 * the full row (REPLICA IDENTITY FULL), which row conditions and public grants evaluate
 * per subscriber. Rows are self-describing, so no second row is ever needed.
 *
 * Fail-closed on every edge: a vetoed row (see `rowReadSubject`) denies all; a subscriber
 * whose memberships fail engine validation denies just that subscriber
 * (`onInvalidMembership: 'deny'`) without poisoning the batch.
 *
 * The same visibility is re-checked when a cache hit is served (`appCache` re-runs
 * `checkAccess` against the cached row), so over-notifying is never a leak here.
 */
export function rowReadDecisions(subscribers: readonly SubscriberAccess[], event: AppStreamProductEvent): boolean[] {
  const subject = rowReadSubject(event);
  if (!subject) return subscribers.map(() => false);
  try {
    const results = checkAccess(subscribers as SubscriberAccess[], 'read', subject, { onInvalidMembership: 'deny' });
    return results.map((result) => result.isAllowed);
  } catch {
    log.error('Stream read decision failed; denying all', {
      entityType: subject.entityType,
      subjectId: subject.id,
    });
    return subscribers.map(() => false);
  }
}

/**
 * Single-subscriber read visibility for one row-scoped event: a batch of one, so the
 * fan-out path and this predicate cannot drift.
 *
 * Exported so the parity property test can assert: SQL predicate ≍ checkAccess ≍ this.
 */
export function canReceiveEntityEvent(subscriber: SubscriberAccess, event: AppStreamProductEvent): boolean {
  return rowReadDecisions([subscriber], event)[0];
}

/**
 * Rebase a product event onto one of its batch rows: subjectId and every CONTEXT id
 * column come from the row itself. Rows are self-describing, which also makes
 * re-parenting evaluate correctly.
 */
export const rowScopedEvent = (
  event: AppStreamProductEvent,
  rowData: Record<string, unknown>,
): AppStreamProductEvent => {
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
 * Product entity events route through org channels; membership events route through the
 * subject user's channel:
 * - Membership events only ever deliver to the affected user, and the user channel reaches
 *   them even for a membership in an org the connection is not registered on (the new-org
 *   invite that tells the client to reconnect).
 * - Product entity events → per-ROW read permission (mirrors the API): a subscriber is
 *   pinged iff they can read at least one row the event speaks for. Rows are evaluated in
 *   order; a subscriber leaves the undecided pool at their first readable row.
 */
export const dispatchToAppStream = createStreamDispatcher<AppStreamSubscriber, AppStreamEvent>({
  getChannel: (event) => {
    if (isMembershipEvent(event)) {
      const membership = getEventData(event, 'membership');
      return membership?.userId ? `user:${membership.userId}` : null;
    }
    return `org:${event.organizationId}`;
  },
  selectEligible: (subscribers, event) => {
    // Membership events: the user channel already targets the subject; keep the check as a net.
    if (isMembershipEvent(event)) {
      const membership = getEventData(event, 'membership');
      return membership?.userId ? subscribers.filter((s) => s.userId === membership.userId) : [];
    }

    const eligible: AppStreamSubscriber[] = [];
    let undecided = subscribers.filter((s) => s.organizationIds.has(event.organizationId));

    for (const { rowData } of eventRows(event)) {
      if (undecided.length === 0) break;
      const scopedEvent = rowData === event.rowData ? event : rowScopedEvent(event, rowData);

      const decisions = rowReadDecisions(undecided, scopedEvent);
      const stillUndecided: AppStreamSubscriber[] = [];
      for (const [index, subscriber] of undecided.entries()) {
        (decisions[index] ? eligible : stillUndecided).push(subscriber);
      }
      undecided = stillUndecided;
    }
    return eligible;
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

  const subscribers = streamSubscriberManager
    .getByChannel<AppStreamSubscriber>(`org:${event.organizationId}`)
    .filter((subscriber) => subscriber.organizationIds.has(event.organizationId));
  if (subscribers.length === 0) return;

  for (const { rowData, movedFrom } of moves) {
    const oldEvent = rowScopedEvent(event, movedFrom);
    const newEvent = rowData === event.rowData ? event : rowScopedEvent(event, rowData);

    const canReadOld = rowReadDecisions(subscribers, oldEvent);
    const canReadNew = rowReadDecisions(subscribers, newEvent);
    const eligible = subscribers.filter((_, index) => canReadOld[index] && !canReadNew[index]);
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
