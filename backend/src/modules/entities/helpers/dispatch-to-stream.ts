import type { SSEStreamingApi } from 'hono/streaming';
import {
  type Access,
  appConfig,
  buildSubject,
  type ChannelIdColumns,
  checkAccessFanout,
  type EntityActionType,
  isUnpublishedDraft,
  type SubjectForPermission,
} from 'shared';
import type { PermissionRowData } from 'shared/permissions/permission-row-data';
import type { ActivityRow } from '#/lib/activity-bus';
import { buildMoveOut, buildStreamChange } from '#/modules/entities/stream/build-change';
import { sendToSubscribers } from '#/modules/entities/stream/helpers';
import { organizationTopic, streamSubscriberManager } from '#/modules/entities/stream/subscriber-manager';
import type { AppStreamProductEvent } from '#/modules/entities/stream/types';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { log } from '#/utils/logger';

/** A signed-in user's stream: its own signals on its user topic, changes and reader signals on each of its organizations' topics. */
export interface AppStreamSubscriber {
  id: string;
  stream: SSEStreamingApi;
  /** The topic the subscriber is routed by, such as `user:123`; `register` takes more. */
  topic?: string;
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

const channelColumns = appConfig.channelEntityTypes.map((channelType) => appConfig.entityIdColumnKeys[channelType]);

/** The event as it reads for one row: every channel id column comes from that row, so a reparented row is judged where it is. */
function rowScopedEvent(event: AppStreamProductEvent, rowData: PermissionRowData): AppStreamProductEvent {
  const overrides: Partial<ChannelIdColumns> = {};
  for (const columnKey of channelColumns) {
    if (columnKey in rowData) overrides[columnKey] = rowData[columnKey];
  }
  return { ...event, ...overrides, organizationId: rowData.organizationId };
}

/** What a row's read decision takes besides its author: the channel columns it carries, its public flag and whether it is a draft. */
function decisionKey(rowData: PermissionRowData): string {
  const place = channelColumns.filter((columnKey) => columnKey in rowData).map((columnKey) => [columnKey, rowData[columnKey]]);
  return JSON.stringify([place, rowData.public === true, isUnpublishedDraft(rowData)]);
}

/** The subject a reader of one row needs access to. Returns `null`, fail-closed, on an unpublished draft or a malformed ancestor scope. */
function rowReadSubject(event: AppStreamProductEvent, row: PermissionRowData): SubjectForPermission | null {
  if (isUnpublishedDraft(row)) return null;

  const scoped = rowScopedEvent(event, row);
  try {
    return buildSubject(scoped.entityType, scoped, { id: row.id, createdBy: row.createdBy ?? undefined, row });
  } catch {
    log.error('Malformed stream event: missing ancestor scope', { entityType: scoped.entityType, subjectId: row.id });
    return null;
  }
}

/** Stream subscribers hold sessions: never a key or token mask. */
function accessesOf(subscribers: readonly SubscriberAccess[]): Access[] {
  return subscribers.map(({ userId, isSystemAdmin, memberships }) => ({ actorId: userId, isSystemAdmin, memberships, scopes: null }));
}

/** The decisions of `accessDecisions` for accesses built once. */
function decide(accesses: Access[], action: EntityActionType, subject: SubjectForPermission): boolean[] {
  try {
    return checkAccessFanout(accesses, action, subject);
  } catch {
    log.error('Stream access decision failed; denying all', { entityType: subject.entityType, subjectId: subject.id, action });
    return accesses.map(() => false);
  }
}

/**
 * Whether each subscriber may take an action on a subject, in one fan-out check that mirrors the API; an invalid
 * membership denies only its own subscriber, and a check that fails denies all.
 * @returns One decision per subscriber, in their order.
 */
export function accessDecisions(subscribers: readonly SubscriberAccess[], action: EntityActionType, subject: SubjectForPermission): boolean[] {
  return decide(accessesOf(subscribers), action, subject);
}

/**
 * Whether each access may read one row of a product event, as the API's row visibility decides it.
 * @param event - The event the row belongs to: it names the product type and the tenant.
 * @param row - The row's permission fields, or those it had before a move.
 * @returns One decision per access, in their order.
 */
function rowReadDecisions(accesses: Access[], event: AppStreamProductEvent, row: PermissionRowData): boolean[] {
  const subject = rowReadSubject(event, row);
  if (!subject) return accesses.map(() => false);
  return decide(accesses, 'read', subject);
}

/**
 * Whether one subscriber may read one row of a product event: a fan-out of one, so this and `readerFrames` cannot drift.
 */
export function canReceiveProductEvent(subscriber: SubscriberAccess, event: AppStreamProductEvent, row: PermissionRowData): boolean {
  return rowReadDecisions(accessesOf([subscriber]), event, row)[0];
}

/** The value `map` holds under `key`, made by `create` and stored on first use. */
function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  const value = map.get(key) ?? create();
  map.set(key, value);
  return value;
}

/**
 * The frames of a product event: each set of its rows that some subscribers may read, in event order, with those
 * subscribers. Only `own` reads a row's author, and it grants that author alone: rows of one `decisionKey` share one
 * decision taken without an author, and an author's own rows are decided again for that author's subscribers, who get
 * a frame each. Every other subscriber that reads the same classes shares one frame.
 */
export function readerFrames<S extends SubscriberAccess>(
  subscribers: readonly S[],
  event: AppStreamProductEvent,
): { rows: ActivityRow[]; readers: S[] }[] {
  const accesses = accessesOf(subscribers);
  const byKey = new Map<string, { allowed: boolean[]; byAuthor: Map<number, boolean> }>();
  const classOf = event.rows.map(({ rowData }) =>
    getOrCreate(byKey, decisionKey(rowData), () => ({
      allowed: rowReadDecisions(accesses, event, { ...rowData, createdBy: null }),
      byAuthor: new Map(),
    })),
  );
  const classes = [...byKey.values()];
  const authors = new Set(event.rows.map(({ rowData }) => rowData.createdBy));

  const frames = new Map<string, { rows: ActivityRow[]; readers: S[] }>();
  for (const [index, subscriber] of subscribers.entries()) {
    const reads = ({ rowData }: ActivityRow, at: number): boolean => {
      const { allowed, byAuthor } = classOf[at];
      if (allowed[index] || rowData.createdBy !== subscriber.userId) return allowed[index];
      return getOrCreate(byAuthor, index, () => rowReadDecisions([accesses[index]], event, rowData)[0]);
    };
    const signature = authors.has(subscriber.userId) ? `author:${index}` : classes.map(({ allowed }) => (allowed[index] ? '1' : '0')).join('');
    const frame = getOrCreate(frames, signature, () => ({ rows: event.rows.filter(reads), readers: [] }));
    frame.readers.push(subscriber);
  }
  return [...frames.values()].filter(({ rows }) => rows.length > 0);
}

/**
 * Tells the app streams of a product event's organization the rows each may read.
 */
export async function dispatchChange(event: AppStreamProductEvent): Promise<void> {
  const subscribers = streamSubscriberManager.getByTopic(organizationTopic(event.organizationId));
  if (subscribers.length === 0) return;

  // A create or update row without seq is a redelivery whose row has since left its table: no reader can fetch it.
  const fetchable = event.action === 'delete' ? event.rows : event.rows.filter(({ seq }) => seq !== undefined);
  await Promise.all(
    readerFrames(subscribers, { ...event, rows: fetchable }).map(({ rows, readers }) => {
      log.trace('Dispatching stream change', { action: event.action, rowCount: rows.length, subscriberCount: readers.length });
      return sendToSubscribers(readers, { event: 'change', data: buildStreamChange(event, rows) }, 'Failed to dispatch stream change');
    }),
  );
}

/**
 * Tells those who lost rows to a move: a subscriber who could read a row where it was and cannot read it where it is
 * gets it in one `moveOut` frame of all the rows it lost, shared with every subscriber who lost the same ones. Everyone
 * else receives the normal update.
 * @param event - A product update; each of its rows that moved carries `movedFrom`.
 */
export async function dispatchMoveOuts(event: AppStreamProductEvent): Promise<void> {
  const moved = event.rows.filter((row): row is ActivityRow & { movedFrom: PermissionRowData } => !!row.movedFrom);
  if (moved.length === 0) return;

  const subscribers = streamSubscriberManager.getByTopic(organizationTopic(event.organizationId));
  if (subscribers.length === 0) return;

  // Per subscriber, the positions in `moved` of the rows it lost.
  const accesses = accessesOf(subscribers);
  const lost: number[][] = subscribers.map(() => []);
  for (const [at, { rowData, movedFrom }] of moved.entries()) {
    const canReadOld = rowReadDecisions(accesses, event, movedFrom);
    const canReadNew = rowReadDecisions(accesses, event, rowData);
    for (const index of subscribers.keys()) if (canReadOld[index] && !canReadNew[index]) lost[index].push(at);
  }

  const losers = subscribers.flatMap((subscriber, index) => (lost[index].length > 0 ? [{ subscriber, rows: lost[index] }] : []));
  await Promise.all(
    [...Map.groupBy(losers, ({ rows }) => rows.join()).values()].map((readers) => {
      const rows = readers[0].rows.map((at) => moved[at]);
      const recipients = readers.map(({ subscriber }) => subscriber);
      return sendToSubscribers(recipients, { event: 'change', data: buildMoveOut(event, rows) }, 'Failed to dispatch move-out');
    }),
  );
}
