import { type ActivityAction, appConfig, buildSubjectFromEntity, checkAccessFanout, type ProductEntityType } from 'shared';
import { deriveDocument } from 'shared/utils/derive-description-core';
import { buildNotificationLink } from 'shared/utils/notification-link';
import { baseDb } from '#/db/db';
import { tenantReadById } from '#/db/tenant-context';
import { homeChannelOf } from '#/db/utils/home-channel';
import type { ActivityRow, ProductActivityEvent } from '#/lib/activity-bus';
import type { NotificationSubjectRow } from '#/lib/module';
import { toUser } from '#/modules/entities/stream/audiences';
import { sendSignal } from '#/modules/entities/stream/send-signal';
import type { NotificationKind } from '#/modules/notification/notification-kinds';
import {
  getUserAccess,
  insertNotificationsIgnoringDuplicates,
  type NotificationInsert,
  type WrittenNotification,
} from '#/modules/notification/notification-queries';
import { getNotificationSource, loadSubjectRows, type NotificationSource } from '#/modules/notification/notification-sources';
import { sendInstantEmails } from '#/modules/notification/operations/send-instant-emails';
import { isPushSendConfigured, sendNotificationPush } from '#/modules/push/push-sender';
import { log } from '#/utils/logger';

type Candidate = { userId: string; kind: NotificationKind };

/** The ids every row of one event shares. */
interface EventIds {
  organizationId: string;
  tenantId: string;
}

/** Runs off the activity bus, outside any request. */
const dbCtx = { var: { db: baseDb } };

/**
 * Turn one CDC event into per-recipient inbox rows, for entity types whose module declared a
 * notification source. Mentions come from the row's stored body when its change
 * can carry new ones; further recipients from the source's `resolveRecipients`. Every recipient
 * passes the same read check, so a mention in a body the client wrote never reaches a user who
 * may not read the row. Each row is told under its own activity and writer, and only the recipients it wrote an inbox
 * row for hear of it: a signal and a push per row, then the instant mail once every row is written.
 *
 * Runs post-commit off the activity bus, so the row is durable before anyone is told about it.
 */
export async function fanOutNotifications(event: ProductActivityEvent): Promise<void> {
  const source = getNotificationSource(event.entityType);
  if (!source) return;
  const { organizationId, tenantId } = event;

  // Mentions and the source's recipient rule are the only ways a row notifies anyone: with neither, nothing to read.
  const changes = event.rows.flatMap((row) => {
    const readsMentions = mayAddMentions(event.action, row);
    return readsMentions || source.declaration.resolveRecipients ? [{ row, subjectId: row.rowData.id, readsMentions }] : [];
  });
  if (changes.length === 0) return;

  // An event carries only the permission columns of its rows, never the body, so the rows are re-read with it.
  const subjectIds = [...new Set(changes.map(({ subjectId }) => subjectId))];
  const subjects = new Map(
    (await tenantReadById(tenantId, (tx) => loadSubjectRows(source, tx, subjectIds, { body: true }))).map((subject) => [subject.id, subject]),
  );

  const ids: EventIds = { organizationId, tenantId };
  const told: WrittenNotification[] = [];
  // In commit order, so a later write of a subject sees who an earlier one told.
  for (const { row, subjectId, readsMentions } of changes) {
    const subject = subjects.get(subjectId);
    if (!subject) continue;
    try {
      told.push(...(await fanOutRow(ids, row, source, subject, readsMentions)));
    } catch (error) {
      log.error('Notification fan-out failed for row', { error, activityId: row.activityId, subjectId });
    }
  }
  await sendInstantEmails(told, subjects);
}

/**
 * Whether a row's change can add mentions: a create, or an update whose changed fields include the
 * body. Publishing a draft arrives as a create (replication emits an insert for a row that enters
 * the publication), so a mention written in a draft notifies at publish. A missing list says
 * nothing, so it counts as a body change; users told before are skipped either way.
 */
function mayAddMentions(action: ActivityAction, { changedFields }: ActivityRow): boolean {
  if (action === 'create') return true;
  if (action !== 'update') return false;
  return !changedFields || changedFields.includes('description');
}

/** Writes one row's notifications under its activity and writer, and signals and pushes the recipients written; returns their rows. */
async function fanOutRow(
  { organizationId, tenantId }: EventIds,
  { activityId, userId: writerId }: ActivityRow,
  source: NotificationSource,
  row: NotificationSubjectRow,
  readsMentions: boolean,
): Promise<WrittenNotification[]> {
  const { entityType } = source;
  const actorId = writerId ?? row.createdBy ?? null;

  const candidates = new Map<string, Candidate>();
  // First writer wins, so a mention outranks the activity classification for the same user.
  const add = (userId: string | null | undefined, kind: NotificationKind) => {
    if (!userId || userId === actorId) return;
    if (!candidates.has(userId)) candidates.set(userId, { userId, kind });
  };

  if (readsMentions) for (const mentioned of deriveDocument(row.description).mentions) add(mentioned, 'mention');

  const { resolveRecipients, resolveContextId } = source.declaration;
  if (resolveRecipients) {
    const recipients = await tenantReadById(tenantId, (tx) => resolveRecipients(tx, row));
    for (const recipient of recipients) add(recipient.userId, recipient.kind);
  }

  if (candidates.size === 0) return [];

  const channel = homeChannelOf(entityType, row);
  const allowed = await filterByReadAccess(entityType, row, channel.id, [...candidates.values()]);
  if (allowed.length === 0) return [];

  const contextId = resolveContextId ? resolveContextId(row) : row.id;
  const place = { tenantId, organizationId, channelId: channel.id, channelType: channel.type, entityType, subjectId: row.id };
  const told = await insertNotificationsIgnoringDuplicates(dbCtx, {
    rows: allowed.map<NotificationInsert>((recipient) => ({ ...recipient, ...place, contextId, activityId, actorId })),
  });

  if (told.length === 0) return [];
  log.debug('Notifications created', { activityId, subjectId: row.id, recipientCount: told.length });

  // An open stream hears of its inbox row at once; a recipient with none gets the push below (`isOnline` skips the rest).
  await Promise.all(told.map(({ userId }) => sendSignal('notification.created', toUser(userId), { organizationId, subjectId: row.id })));

  if (isPushSendConfigured()) {
    const primaryKind = told.some((recipient) => recipient.kind === 'mention') ? 'mention' : told[0].kind;
    const url = buildNotificationLink(appConfig.frontendUrl, { ...place, contextId: contextId ?? undefined });
    await sendNotificationPush(
      told.map((recipient) => recipient.userId),
      { t: 'notif', activityId, channelId: channel.id, kind: primaryKind, url },
    );
  }
  return told;
}

/**
 * Keep only recipients who belong to the row's organization and may read the row, then drop candidates other than
 * mentions whose home membership is muted. A public row reads for any id, so a candidate that names no user, or a user
 * outside the organization (whose row the inbox would never list), is left out by the lookup and the membership.
 */
async function filterByReadAccess(
  entityType: ProductEntityType,
  row: NotificationSubjectRow,
  channelId: string,
  candidates: Candidate[],
): Promise<Candidate[]> {
  const accessByUser = await getUserAccess(dbCtx, { userIds: candidates.map((candidate) => candidate.userId) });
  const known = candidates.flatMap((candidate) => {
    const access = accessByUser.get(candidate.userId);
    const belongs = access?.isSystemAdmin || access?.memberships.some((membership) => membership.organizationId === row.organizationId);
    return access && belongs ? [{ candidate, access }] : [];
  });

  const accesses = known.map(({ access }) => access);
  const decisions = checkAccessFanout(accesses, 'read', buildSubjectFromEntity(entityType, row));

  return known.flatMap(({ candidate, access }, index) => {
    if (!decisions[index]) return [];
    // A mention is addressed to the user, so a muted membership never silences it.
    if (candidate.kind === 'mention') return [candidate];

    const muted = access.memberships.some((membership) => membership.channelId === channelId && membership.muted);
    return muted ? [] : [candidate];
  });
}
