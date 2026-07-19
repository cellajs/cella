import { appConfig, isUnpublishedDraft, type SubjectForPermission } from 'shared';
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
  return decideRowRead(subscriber, buildRowReadContext(event));
}

/**
 * Everything a read decision needs from one event row, built ONCE per row and shared by
 * every subscriber the dispatch loop evaluates. The subject (and the draft/scope veto) are
 * subscriber-independent; rebuilding them per subscriber was pure fan-out overhead.
 */
interface RowReadContext {
  /** Draft row or malformed ancestor scope: deny everyone, fail-closed. */
  vetoed: boolean;
  subject: SubjectForPermission | null;
  /** The row's truthy channel levels as [channelType, channelId] — the exact membership lookups the engine makes. */
  channelLevels: Array<[string, string]>;
  createdBy: string | null;
  /** Access-class key → decision. Lives only as long as the event, so it can never go stale. */
  decisions: Map<string, boolean>;
}

const buildRowReadContext = (event: AppStreamProductEvent): RowReadContext => {
  const veto: RowReadContext = {
    vetoed: true,
    subject: null,
    channelLevels: [],
    createdBy: null,
    decisions: new Map(),
  };
  const row = (event.rowData ?? undefined) as Record<string, unknown> | undefined;

  if (isUnpublishedDraft(row)) return veto;

  const createdBy = (row?.createdBy as string | null | undefined) ?? null;
  try {
    const subject = buildSubject(event.entityType, event, {
      id: event.subjectId ?? undefined,
      createdBy: createdBy ?? undefined,
      row,
    });

    const channelLevels: Array<[string, string]> = [];
    for (const [channelType, channelId] of Object.entries(subject.channelIds)) {
      if (channelId) channelLevels.push([channelType, channelId]);
    }
    // Channel-entity subjects resolve their own level from subject.id (mirrors getSubjectChannelId)
    if ((appConfig.channelEntityTypes as readonly string[]).includes(event.entityType) && subject.id) {
      channelLevels.push([event.entityType, subject.id]);
    }

    return { vetoed: false, subject, channelLevels, createdBy, decisions: new Map() };
  } catch {
    log.error('Malformed stream event: missing ancestor scope', {
      entityType: event.entityType,
      subjectId: event.subjectId,
    });
    return veto;
  }
};

/** The uncached decision: the same engine call the API makes. */
const decideRowRead = (subscriber: SubscriberAccess, ctx: RowReadContext): boolean => {
  if (ctx.vetoed || !ctx.subject) return false;
  try {
    return checkPermission(subscriber.memberships, 'read', ctx.subject, {
      userId: subscriber.userId,
      isSystemAdmin: subscriber.isSystemAdmin,
    }).isAllowed;
  } catch {
    log.error('Malformed stream event: permission check failed', {
      entityType: ctx.subject.entityType,
      subjectId: ctx.subject.id,
    });
    return false;
  }
};

/**
 * A subscriber's access class for one row: the full projection of what the engine's
 * decision reads from the subscriber. Two subscribers with equal keys are
 * indistinguishable to `checkPermission` for this row:
 * - system-admin bit (engine short-circuits to allow),
 * - owner bit (the only place `userId` enters: the `'own'` row condition; `'public'`
 *   reads the row alone),
 * - the sorted set of `channelType:role` pairs whose membership matches one of the
 *   row's channel levels — exactly the `${channelType}:${channelId}` index hits the
 *   engine's policy walk iterates. Grant scoping (`elevatedRoles`, home channel) is a
 *   function of (pair, row), so it cannot split a class.
 * - `!` marks a membership `validateMembership` would reject; the engine fails the WHOLE
 *   check on it (deny), so malformed subscribers must not share a class with clean ones.
 */
const classKeyFor = (subscriber: SubscriberAccess, ctx: RowReadContext): string => {
  const bits = `${subscriber.isSystemAdmin ? 'A' : ''}${subscriber.userId && ctx.createdBy === subscriber.userId ? 'O' : ''}`;

  const pairs: string[] = [];
  for (const m of subscriber.memberships) {
    if (!m.channelType || !m.channelId || !m.role || typeof m.role !== 'string') {
      pairs.push('!');
      continue;
    }
    for (const [channelType, channelId] of ctx.channelLevels) {
      if (channelType === m.channelType && channelId === m.channelId) {
        pairs.push(`${m.channelType}:${m.role}`);
        break;
      }
    }
  }
  if (pairs.length === 0) return bits;
  if (pairs.length > 1) pairs.sort();
  return `${bits}|${pairs.join(',')}`;
};

/** Class-memoized decision: at most one engine call per distinct access class per row. */
const decideRowReadCached = (subscriber: SubscriberAccess, ctx: RowReadContext): boolean => {
  if (ctx.vetoed) return false;
  const key = classKeyFor(subscriber, ctx);
  const hit = ctx.decisions.get(key);
  if (hit !== undefined) return hit;
  const decision = decideRowRead(subscriber, ctx);
  ctx.decisions.set(key, decision);
  return decision;
};

/**
 * Per-event row contexts, keyed by event identity. The cache dies with the event object,
 * so no invalidation exists — a membership mutation always produces a fresh event.
 */
const rowContextCache = new WeakMap<object, RowReadContext>();
const eventRowContextsCache = new WeakMap<object, RowReadContext[]>();

/** `canReceiveEntityEvent` with the per-event class memo, for row-scoped events reused across a subscriber loop. */
export function canReceiveEntityEventCached(subscriber: SubscriberAccess, event: AppStreamProductEvent): boolean {
  let ctx = rowContextCache.get(event);
  if (!ctx) {
    ctx = buildRowReadContext(event);
    rowContextCache.set(event, ctx);
  }
  return decideRowReadCached(subscriber, ctx);
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
 *   pinged iff they can read at least one row the event speaks for.
 */
export const dispatchToAppStream = createStreamDispatcher<AppStreamSubscriber, AppStreamEvent>({
  getChannel: (event) => {
    if (isMembershipEvent(event)) {
      const membership = getEventData(event, 'membership');
      return membership?.userId ? `user:${membership.userId}` : null;
    }
    return `org:${event.organizationId}`;
  },
  shouldReceive: (subscriber, event) => {
    // Membership events: the user channel already targets the subject; keep the check as a net.
    if (isMembershipEvent(event)) {
      const membership = getEventData(event, 'membership');
      return membership?.userId === subscriber.userId;
    }

    if (!subscriber.organizationIds.has(event.organizationId)) return false;

    // Row contexts (scoped event + subject) are subscriber-independent: build once per
    // event, then answer each subscriber from the per-row class memo.
    let rowContexts = eventRowContextsCache.get(event);
    if (!rowContexts) {
      rowContexts = eventRows(event).map(({ rowData }) =>
        buildRowReadContext(rowData === event.rowData ? event : rowScopedEvent(event, rowData)),
      );
      eventRowContextsCache.set(event, rowContexts);
    }
    return rowContexts.some((ctx) => decideRowReadCached(subscriber, ctx));
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
        canReceiveEntityEventCached(subscriber, oldEvent) &&
        !canReceiveEntityEventCached(subscriber, newEvent),
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
