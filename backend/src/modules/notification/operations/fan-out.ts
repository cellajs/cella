import { appConfig, type ChannelEntityType, hierarchy, isChannel, isProduct, type ProductEntityType } from 'shared';
import { deriveDocument } from 'shared/utils/derive-description-core';
import { buildNotificationLink } from 'shared/utils/notification-link';
import { baseDb } from '#/db/db';
import { tenantReadById } from '#/db/tenant-context';
import type { ActivityEvent } from '#/lib/activity-bus';
import type { NotificationSubjectRow } from '#/lib/module';
import { isPushSendConfigured, sendNotificationPush } from '#/modules/push/push-sender';
import { checkAccessFanout } from '#/permissions';
import { buildSubjectFromEntity } from '#/permissions/build-subject';
import { log } from '#/utils/logger';
import { findNotifiedUserIds, getUserAccess, insertNotificationsIgnoringDuplicates, type NotificationInsert } from '../notification-queries';
import { getNotificationSource, loadSubjectRows, type NotificationSource } from '../notification-sources';
import { instantEmailTypes, type NotificationType, notificationTypes } from '../notification-types';

/** Types a muted membership silences. Mentions are deliberately absent: they are addressed to you. */
const mutedTypes = new Set<NotificationType>(notificationTypes.filter((type) => type !== 'mention'));

type Candidate = { userId: string; type: NotificationType };

/** Runs off the activity bus, outside any request. */
const dbCtx = { var: { db: baseDb } };

/**
 * Turn one CDC event into per-recipient inbox rows, for entity types whose module declared a
 * notification source (lib/module.ts). Mentions come from the row's stored body when the event
 * can carry new ones; further recipients from the source's `resolveRecipients`. Every recipient
 * passes the same read check, so a mention in a body the client wrote never reaches a user who
 * may not read the row.
 *
 * Runs post-commit off the activity bus, so the row is durable before anyone is told about it.
 * Resolves true when it wrote a row the instant email pass mails (`instantEmailTypes`): a mention,
 * or a comment or reply while the app sets `has.commentEmail`.
 */
export async function fanOutNotifications(event: ActivityEvent): Promise<boolean> {
  const entityType = event.entityType;
  if (!entityType || !isProduct(entityType)) return false;
  const source = getNotificationSource(entityType);
  if (!source) return false;
  const { organizationId, tenantId, id: activityId } = event;
  if (!organizationId || !tenantId || !activityId) return false;

  const subjectIds = collectSubjectIds(event);
  if (subjectIds.length === 0) return false;

  const readsMentions = source.declaration.mentionable !== false && mayAddMentions(event);
  // Mentions and the source's recipient rule are the only ways a row notifies anyone: with neither, nothing to read.
  if (!readsMentions && !source.declaration.resolveRecipients) return false;

  // Batch events carry only permission columns, never the body, so the rows are re-read.
  const rows = await tenantReadById(tenantId, (tx) => loadSubjectRows(source, tx, subjectIds, { body: readsMentions }));

  let mailable = false;
  for (const row of rows) {
    try {
      if (await fanOutRow(event, entityType, source, row, tenantId, readsMentions)) mailable = true;
    } catch (error) {
      log.error('Notification fan-out failed for row', { error, activityId, subjectId: row.id });
    }
  }
  return mailable;
}

/**
 * Whether the event can add mentions: a create, or an update whose changed fields include the
 * body. A batch carries its first row's changed fields only and a missing list says nothing, so
 * both count as a body change; users told before are skipped either way.
 */
function mayAddMentions(event: ActivityEvent): boolean {
  if (event.action === 'create') return true;
  if (event.action !== 'update') return false;
  if (!event.changedFields || (event.batchRows?.length ?? 0) > 1) return true;
  return event.changedFields.includes('description');
}

/** Single events name one subject; batches list theirs in `batchRows`. */
function collectSubjectIds(event: ActivityEvent): string[] {
  if (event.batchRows?.length) {
    const ids = event.batchRows.map((batchRow) => (batchRow.rowData as { id?: unknown })?.id).filter((id): id is string => typeof id === 'string');
    if (ids.length) return ids;
  }
  return event.subjectId ? [event.subjectId] : [];
}

/** Writes one row's notifications; true when one is mailable (a redelivered one too, so its email pass reruns). */
async function fanOutRow(
  event: ActivityEvent,
  entityType: ProductEntityType,
  source: NotificationSource,
  row: NotificationSubjectRow,
  tenantId: string,
  readsMentions: boolean,
): Promise<boolean> {
  const actorId = event.userId ?? row.createdBy ?? null;

  const candidates = new Map<string, Candidate>();
  // First writer wins, so a mention outranks the activity classification for the same user.
  const add = (userId: string | null | undefined, type: NotificationType) => {
    if (!userId || userId === actorId) return;
    if (!candidates.has(userId)) candidates.set(userId, { userId, type });
  };

  if (readsMentions) for (const mentioned of deriveDocument(row.description).mentions) add(mentioned, 'mention');

  const { resolveRecipients, resolveContextId } = source.declaration;
  if (resolveRecipients) {
    const recipients = await tenantReadById(tenantId, (tx) => resolveRecipients(tx, row));
    for (const recipient of recipients) add(recipient.userId, recipient.type);
  }

  if (candidates.size === 0) return false;

  // An edit must not re-notify people who were already told about this row.
  const notified = event.action === 'update' ? await findNotifiedUserIds(dbCtx, { subjectId: row.id, userIds: [...candidates.keys()] }) : new Set();
  const fresh = [...candidates.values()].filter((candidate) => !notified.has(candidate.userId));
  if (fresh.length === 0) return false;

  const allowed = await filterByReadAccess(entityType, row, fresh);
  if (allowed.length === 0) return false;

  const channel = resolveChannel(entityType, row);
  const organizationId = event.organizationId as string;
  const contextId = resolveContextId ? resolveContextId(row) : row.id;
  await insertNotificationsIgnoringDuplicates(dbCtx, {
    rows: allowed.map<NotificationInsert>((recipient) => ({
      userId: recipient.userId,
      type: recipient.type,
      entityType,
      subjectId: row.id,
      contextId,
      channelId: channel.id,
      channelType: channel.type,
      organizationId,
      tenantId,
      activityId: event.id as string,
      actorId,
    })),
  });

  log.debug('Notifications created', { activityId: event.id, subjectId: row.id, recipientCount: allowed.length });

  // Best-effort Web Push on top of the durable rows; the audience is already resolved, so this
  // costs one subscription lookup. Never awaited into the fan-out's failure path.
  if (isPushSendConfigured()) {
    const primaryType = allowed.some((recipient) => recipient.type === 'mention') ? 'mention' : allowed[0].type;
    const url = buildNotificationLink(appConfig.frontendUrl, {
      tenantId,
      organizationId,
      channelId: channel.id,
      channelType: channel.type,
      entityType,
      subjectId: row.id,
      contextId: contextId ?? undefined,
    });
    await sendNotificationPush(
      allowed.map((recipient) => recipient.userId),
      { t: 'notif', activityId: event.id as string, channelId: channel.id, type: primaryType, url },
    );
  }
  const mailed = instantEmailTypes();
  return allowed.some((recipient) => mailed.includes(recipient.type));
}

/**
 * Keep only recipients who may read the row, then drop muted-type candidates whose home membership is muted.
 * Fails closed: an unknown user drops the whole set, as a doctored id must never notify anyone.
 */
async function filterByReadAccess(entityType: ProductEntityType, row: NotificationSubjectRow, candidates: Candidate[]): Promise<Candidate[]> {
  const accessByUser = await getUserAccess(dbCtx, { userIds: candidates.map((candidate) => candidate.userId) });
  const accesses = candidates.map((candidate) => accessByUser.get(candidate.userId)).filter((access) => access !== undefined);
  if (accesses.length !== candidates.length) return [];

  const decisions = checkAccessFanout(accesses, 'read', buildSubjectFromEntity(entityType, row), { onInvalidMembership: 'deny' });
  const { id: channelId } = resolveChannel(entityType, row);

  return candidates.filter((candidate, index) => {
    if (!decisions[index]?.allowed) return false;
    if (!mutedTypes.has(candidate.type)) return true;

    const muted = accesses[index].memberships.some((membership) => membership.channelId === channelId && membership.muted);
    return !muted;
  });
}

/** The row's home channel, row-side twin of `homeChannelIdSql`. */
function resolveChannel(entityType: ProductEntityType, row: NotificationSubjectRow): { id: string; type: ChannelEntityType } {
  const [deepest] = hierarchy.resolveNonNullAncestors(entityType, row);
  if (deepest && isChannel(deepest.type)) return { id: deepest.id, type: deepest.type };
  return { id: row.organizationId, type: 'organization' };
}
