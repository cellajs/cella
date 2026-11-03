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
import {
  findNotifiedUserIds,
  getUserAccess,
  insertNotificationsIgnoringDuplicates,
  type NotificationInsert,
} from '#/modules/notification/notification-queries';
import { getNotificationSource, loadSubjectRows, type NotificationSource } from '#/modules/notification/notification-sources';
import { instantEmailTypes, type NotificationType } from '#/modules/notification/notification-types';
import { isPushSendConfigured, sendNotificationPush } from '#/modules/push/push-sender';
import { log } from '#/utils/logger';

type Candidate = { userId: string; type: NotificationType };

/** The ids every row of one event shares. */
interface EventIds {
  organizationId: string;
  tenantId: string;
}

/** Runs off the activity bus, outside any request. */
const dbCtx = { var: { db: baseDb } };

/**
 * Turn one CDC event into per-recipient inbox rows, for entity types whose module declared a
 * notification source (lib/module.ts). Mentions come from the row's stored body when its change
 * can carry new ones; further recipients from the source's `resolveRecipients`. Every recipient
 * passes the same read check, so a mention in a body the client wrote never reaches a user who
 * may not read the row. Each row is told under its own activity and writer.
 *
 * Runs post-commit off the activity bus, so the row is durable before anyone is told about it.
 * Resolves true when it wrote a row the instant email pass mails (`instantEmailTypes`): a mention,
 * or a comment or reply while the app sets `has.commentEmail`.
 */
export async function fanOutNotifications(event: ProductActivityEvent): Promise<boolean> {
  const source = getNotificationSource(event.entityType);
  if (!source) return false;
  const { organizationId, tenantId } = event;
  if (!organizationId || !tenantId) return false;

  const mentionable = source.declaration.mentionable !== false;
  // Mentions and the source's recipient rule are the only ways a row notifies anyone: with neither, nothing to read.
  const changes = event.rows.flatMap((row) => {
    const subjectId = row.rowData.id;
    const readsMentions = mentionable && mayAddMentions(event.action, row);
    return typeof subjectId === 'string' && (readsMentions || source.declaration.resolveRecipients) ? [{ row, subjectId, readsMentions }] : [];
  });
  if (changes.length === 0) return false;

  // An event carries only the permission columns of its rows, never the body, so the rows are re-read.
  const subjectIds = [...new Set(changes.map(({ subjectId }) => subjectId))];
  const body = changes.some(({ readsMentions }) => readsMentions);
  const subjects = new Map(
    (await tenantReadById(tenantId, (tx) => loadSubjectRows(source, tx, subjectIds, { body }))).map((subject) => [subject.id, subject]),
  );

  const ids: EventIds = { organizationId, tenantId };
  let mailable = false;
  // In commit order, so a later write of a subject sees who an earlier one told.
  for (const { row, subjectId, readsMentions } of changes) {
    const subject = subjects.get(subjectId);
    if (!subject) continue;
    try {
      if (await fanOutRow(event.action, ids, row, source, subject, readsMentions)) mailable = true;
    } catch (error) {
      log.error('Notification fan-out failed for row', { error, activityId: row.activityId, subjectId });
    }
  }
  return mailable;
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

/** Writes one row's notifications under its activity and writer; true when one is mailable (a redelivered one too, so its email pass reruns). */
async function fanOutRow(
  action: ActivityAction,
  { organizationId, tenantId }: EventIds,
  { activityId, userId: writerId }: ActivityRow,
  source: NotificationSource,
  row: NotificationSubjectRow,
  readsMentions: boolean,
): Promise<boolean> {
  const { entityType } = source;
  const actorId = writerId ?? row.createdBy ?? null;

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
  const notified = action === 'update' ? await findNotifiedUserIds(dbCtx, { subjectId: row.id, userIds: [...candidates.keys()] }) : new Set();
  const fresh = [...candidates.values()].filter((candidate) => !notified.has(candidate.userId));
  if (fresh.length === 0) return false;

  const channel = homeChannelOf(entityType, row);
  const allowed = await filterByReadAccess(entityType, row, channel.id, fresh);
  if (allowed.length === 0) return false;

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
      activityId,
      actorId,
    })),
  });

  log.debug('Notifications created', { activityId, subjectId: row.id, recipientCount: allowed.length });

  // An open stream hears of its inbox row at once; a recipient with none gets the push below (`isOnline` skips the rest).
  await Promise.all(allowed.map(({ userId }) => sendSignal('notification.created', toUser(userId), { organizationId, subjectId: row.id })));

  // Best-effort Web Push on top of the durable rows; the audience is already resolved, so this costs one subscription
  // lookup. `sendNotificationPush` never throws; the instant email pass runs once it returns.
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
      { t: 'notif', activityId, channelId: channel.id, type: primaryType, url },
    );
  }
  const mailed = instantEmailTypes();
  return allowed.some((recipient) => mailed.includes(recipient.type));
}

/**
 * Keep only recipients who may read the row, then drop candidates other than mentions whose home membership is muted.
 * A candidate that names no user is left out alone: a public row reads for any id, and the inbox holds users only.
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
    return access ? [{ candidate, access }] : [];
  });

  const accesses = known.map(({ access }) => access);
  const decisions = checkAccessFanout(accesses, 'read', buildSubjectFromEntity(entityType, row));

  return known.flatMap(({ candidate, access }, index) => {
    if (!decisions[index]) return [];
    // A mention is addressed to the user, so a muted membership never silences it.
    if (candidate.type === 'mention') return [candidate];

    const muted = access.memberships.some((membership) => membership.channelId === channelId && membership.muted);
    return muted ? [] : [candidate];
  });
}
