import { appConfig, isUnpublishedDraft, type SubjectForPermission } from 'shared';
import { getEventData } from '#/lib/activity-bus';
import { buildMoveOutNotification, buildStreamNotification, isMembershipEvent } from '#/modules/entities/stream/build-message';
import { sendToSubscribers } from '#/modules/entities/stream/helpers';
import { organizationTopic, streamSubscriberManager, userTopic } from '#/modules/entities/stream/subscriber-manager';
import type { AppStreamEvent, AppStreamProductEvent, BaseStreamSubscriber } from '#/modules/entities/stream/types';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { checkAccessFanout } from '#/permissions';
import { buildSubject } from '#/permissions/build-subject';
import { log } from '#/utils/logger';

/** A signed-in user's stream: its own membership events on its user topic, product events on each of its organizations' topics. */
export interface AppStreamSubscriber extends BaseStreamSubscriber {
  userId: string;
  /** The session this connection authenticated with; its ending closes the stream. */
  sessionId: string;
  organizationIds: Set<string>;
  isSystemAdmin: boolean;
  /** Whether it connected from an address allowed system access: with the role, it reads as system admin. */
  systemAccessAllowed: boolean;
  memberships: MembershipBaseModel[];
}

/** The subscriber fields a read decision takes. */
export type SubscriberAccess = Pick<AppStreamSubscriber, 'userId' | 'isSystemAdmin' | 'memberships'>;

/** The event as it reads for one row: the subject id and every channel id column come from that row, so a reparented row is judged where it is. */
function rowScopedEvent(event: AppStreamProductEvent, rowData: Record<string, unknown>): AppStreamProductEvent {
  const overrides: Record<string, unknown> = {};
  if (typeof rowData.id === 'string') overrides.subjectId = rowData.id;
  for (const channelType of appConfig.channelEntityTypes) {
    const columnKey = appConfig.entityIdColumnKeys[channelType];
    if (columnKey in rowData) overrides[columnKey] = rowData[columnKey];
  }
  return { ...event, ...overrides } as AppStreamProductEvent;
}

/** The subject a reader of one row needs access to. Returns `null`, fail-closed, on an unpublished draft or a malformed ancestor scope. */
function rowReadSubject(event: AppStreamProductEvent, row: Record<string, unknown>): SubjectForPermission | null {
  if (isUnpublishedDraft(row)) return null;

  const scoped = rowScopedEvent(event, row);
  try {
    return buildSubject(scoped.entityType, scoped, {
      id: scoped.subjectId,
      createdBy: (row.createdBy as string | null | undefined) ?? undefined,
      row,
    });
  } catch {
    log.error('Malformed stream event: missing ancestor scope', { entityType: scoped.entityType, subjectId: scoped.subjectId });
    return null;
  }
}

/**
 * Whether each subscriber may read one row of a product event. Mirrors API row visibility in one fan-out check; an
 * invalid membership denies only its own subscriber.
 * @param subscribers - Who to decide for.
 * @param event - The event the row belongs to: it names the product type and the tenant.
 * @param row - The row's permission fields, or those it had before a move.
 * @returns One decision per subscriber, in their order.
 */
export function rowReadDecisions(subscribers: readonly SubscriberAccess[], event: AppStreamProductEvent, row: Record<string, unknown>): boolean[] {
  const subject = rowReadSubject(event, row);
  if (!subject) return subscribers.map(() => false);
  try {
    // Stream subscribers hold sessions: never a key or token mask.
    const accesses = subscribers.map((subscriber) => ({
      actorId: subscriber.userId,
      isSystemAdmin: subscriber.isSystemAdmin,
      memberships: subscriber.memberships,
      scopes: null,
    }));
    const results = checkAccessFanout(accesses, 'read', subject, { onInvalidMembership: 'deny' });
    return results.map((result) => result.allowed);
  } catch {
    log.error('Stream read decision failed; denying all', { entityType: subject.entityType, subjectId: subject.id });
    return subscribers.map(() => false);
  }
}

/**
 * Whether one subscriber may read one row of a product event: a fan-out of one, so this and `rowReadDecisions` cannot drift.
 * @param subscriber - Who to decide for.
 * @param event - The event the row belongs to.
 * @param row - The row's permission fields.
 * @returns Whether the subscriber may read the row.
 */
export function canReceiveProductEvent(subscriber: SubscriberAccess, event: AppStreamProductEvent, row: Record<string, unknown>): boolean {
  return rowReadDecisions([subscriber], event, row)[0];
}

/** The subscribers on an organization's topic that hold the organization. */
function organizationSubscribers(organizationId: string): AppStreamSubscriber[] {
  return streamSubscriberManager
    .getByTopic<AppStreamSubscriber>(organizationTopic(organizationId))
    .filter((subscriber) => subscriber.organizationIds.has(organizationId));
}

/** The subscribers that may read any row of a product event: visibility may differ per row. */
function productEventReaders(subscribers: AppStreamSubscriber[], event: AppStreamProductEvent): AppStreamSubscriber[] {
  const eligible: AppStreamSubscriber[] = [];
  let undecided = subscribers;
  for (const { rowData } of event.rows) {
    if (undecided.length === 0) break;
    const decisions = rowReadDecisions(undecided, event, rowData);
    const stillUndecided: AppStreamSubscriber[] = [];
    for (const [index, subscriber] of undecided.entries()) {
      (decisions[index] ? eligible : stillUndecided).push(subscriber);
    }
    undecided = stillUndecided;
  }
  return eligible;
}

/**
 * Tells the app streams that may see an event: a membership event goes to its user's streams, a product event to the
 * streams of its organization that may read any of its rows.
 * @param event - A product or membership change from the activity bus.
 */
export async function dispatchToAppStream(event: AppStreamEvent): Promise<void> {
  let topic: string;
  let eligible: AppStreamSubscriber[];
  if (isMembershipEvent(event)) {
    const userId = getEventData(event, 'membership')?.userId;
    if (!userId) return;
    topic = userTopic(userId);
    // The user topic already targets the subject; this filter is the safety net.
    eligible = streamSubscriberManager.getByTopic<AppStreamSubscriber>(topic).filter((subscriber) => subscriber.userId === userId);
  } else {
    topic = organizationTopic(event.organizationId);
    eligible = productEventReaders(organizationSubscribers(event.organizationId), event);
  }
  if (eligible.length === 0) return;

  log.trace('Dispatching stream event', {
    activityId: event.id,
    action: event.action,
    subjectId: event.subjectId,
    topic,
    subscriberCount: eligible.length,
  });

  await sendToSubscribers(eligible, event, buildStreamNotification(event), 'Failed to dispatch stream event');
}

/**
 * Tells those who lost a row to a move: a subscriber who could read a row where it was and cannot read it where it is
 * gets `moveOut` for it. Everyone else receives the normal update.
 * @param event - A product update; each of its rows that moved carries `movedFrom`.
 */
export async function dispatchMoveOuts(event: AppStreamProductEvent): Promise<void> {
  const moves = event.rows.flatMap(({ rowData, movedFrom }) => (movedFrom ? [{ rowData, movedFrom }] : []));
  if (moves.length === 0) return;

  const subscribers = organizationSubscribers(event.organizationId);
  if (subscribers.length === 0) return;

  for (const { rowData, movedFrom } of moves) {
    const canReadOld = rowReadDecisions(subscribers, event, movedFrom);
    const canReadNew = rowReadDecisions(subscribers, event, rowData);
    const eligible = subscribers.filter((_, index) => canReadOld[index] && !canReadNew[index]);
    if (eligible.length === 0) continue;

    const oldEvent = rowScopedEvent(event, movedFrom);
    await sendToSubscribers(eligible, oldEvent, buildMoveOutNotification(oldEvent, movedFrom), 'Failed to dispatch move-out');
  }
}
