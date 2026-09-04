import { appConfig, type ChannelEntityType, hierarchy, isChannel, isProduct, type ProductEntityType } from 'shared';
import { buildNotificationLink } from 'shared/utils/notification-link';
import { tenantReadById } from '#/db/tenant-context';
import type { ActivityEvent } from '#/lib/activity-bus';
import type { NotificationSubjectRow } from '#/lib/module';
import { isPushSendConfigured, sendNotificationPush } from '#/modules/push/push-sender';
import { log } from '#/utils/logger';
import { readableAccess } from '../helpers/readable-access';
import {
  findNotifiedUserIds,
  insertNotificationsIgnoringDuplicates,
  type NotificationInsert,
} from '../notification-queries';
import { getNotificationSource, loadSubjectRows, type NotificationSource } from '../notification-sources';
import { type NotificationType, notificationTypes } from '../notification-types';

/** Types a muted membership silences. Mentions are deliberately absent: they are addressed to you. */
const mutedTypes = new Set<NotificationType>(notificationTypes.filter((type) => type !== 'mention'));

type Candidate = { userId: string; type: NotificationType };

/**
 * Turn one CDC event into per-recipient inbox rows, for entity types whose module declared a
 * notification source (lib/module.ts). Mentions come from the server-derived `mentions` column;
 * further recipients from the source's `resolveRecipients`.
 *
 * Runs post-commit off the activity bus, so the row is durable before anyone is told about it.
 */
export async function fanOutNotifications(event: ActivityEvent): Promise<void> {
  const entityType = event.entityType;
  if (!entityType || !isProduct(entityType)) return;
  const source = getNotificationSource(entityType);
  if (!source) return;
  const { organizationId, tenantId, id: activityId } = event;
  if (!organizationId || !tenantId || !activityId) return;

  const subjectIds = collectSubjectIds(event);
  if (subjectIds.length === 0) return;

  // Batch events carry only permission columns, never `mentions`, so the rows are always re-read.
  const rows = await tenantReadById(tenantId, (tx) => loadSubjectRows(source, tx, subjectIds));

  for (const row of rows) {
    try {
      await fanOutRow(event, entityType, source, row, tenantId);
    } catch (error) {
      log.error('Notification fan-out failed for row', { error, activityId, subjectId: row.id });
    }
  }
}

/** Single events name one subject; batches list theirs in `batchRows`. */
function collectSubjectIds(event: ActivityEvent): string[] {
  if (event.batchRows?.length) {
    const ids = event.batchRows
      .map((batchRow) => (batchRow.rowData as { id?: unknown })?.id)
      .filter((id): id is string => typeof id === 'string');
    if (ids.length) return ids;
  }
  return event.subjectId ? [event.subjectId] : [];
}

async function fanOutRow(
  event: ActivityEvent,
  entityType: ProductEntityType,
  source: NotificationSource,
  row: NotificationSubjectRow,
  tenantId: string,
): Promise<void> {
  const actorId = event.userId ?? row.createdBy ?? null;

  const candidates = new Map<string, Candidate>();
  // First writer wins, so a mention outranks the activity classification for the same user.
  const add = (userId: string | null | undefined, type: NotificationType) => {
    if (!userId || userId === actorId) return;
    if (!candidates.has(userId)) candidates.set(userId, { userId, type });
  };

  if (source.mentionable) for (const mentioned of row.mentions ?? []) add(mentioned, 'mention');

  const { resolveRecipients, resolveContextId } = source.declaration;
  if (resolveRecipients) {
    const recipients = await tenantReadById(tenantId, (tx) => resolveRecipients(tx, row));
    for (const recipient of recipients) add(recipient.userId, recipient.type);
  }

  if (candidates.size === 0) return;

  // An edit must not re-notify people who were already told about this row.
  const notified = event.action === 'update' ? await findNotifiedUserIds(row.id, [...candidates.keys()]) : new Set();
  const fresh = [...candidates.values()].filter((candidate) => !notified.has(candidate.userId));
  if (fresh.length === 0) return;

  const allowed = await filterByReadAccess(entityType, row, fresh);
  if (allowed.length === 0) return;

  const channel = resolveChannel(entityType, row);
  const organizationId = event.organizationId as string;
  await insertNotificationsIgnoringDuplicates(
    allowed.map<NotificationInsert>((recipient) => ({
      userId: recipient.userId,
      type: recipient.type,
      entityType,
      subjectId: row.id,
      contextId: resolveContextId ? resolveContextId(row) : row.id,
      channelId: channel.id,
      channelType: channel.type,
      organizationId,
      tenantId,
      activityId: event.id as string,
      actorId,
    })),
  );

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
    });
    await sendNotificationPush(
      allowed.map((recipient) => recipient.userId),
      { t: 'notif', activityId: event.id as string, channelId: channel.id, type: primaryType, url },
    );
  }
}

/** Keep only recipients who may read the row, then drop muted-type candidates whose home membership is muted. */
async function filterByReadAccess(
  entityType: ProductEntityType,
  row: NotificationSubjectRow,
  candidates: Candidate[],
): Promise<Candidate[]> {
  const readable = await readableAccess(
    entityType,
    row,
    candidates.map((candidate) => candidate.userId),
  );
  const { id: channelId } = resolveChannel(entityType, row);

  return candidates.filter((candidate) => {
    const access = readable.get(candidate.userId);
    if (!access) return false;
    if (!mutedTypes.has(candidate.type)) return true;

    const muted = access.memberships.some((membership) => membership.channelId === channelId && membership.muted);
    return !muted;
  });
}

/** The row's home channel, row-side twin of `homeChannelIdSql`. */
function resolveChannel(
  entityType: ProductEntityType,
  row: NotificationSubjectRow,
): { id: string; type: ChannelEntityType } {
  const [deepest] = hierarchy.resolveNonNullAncestors(entityType, row);
  if (deepest && isChannel(deepest.type)) return { id: deepest.id, type: deepest.type };
  return { id: row.organizationId, type: 'organization' };
}
