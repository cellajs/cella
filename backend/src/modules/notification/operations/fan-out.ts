import { hierarchy, type ProductEntityType } from 'shared';
import { tenantReadById } from '#/db/tenant-context';
import type { ActivityEvent } from '#/lib/activity-bus';
import type { ModuleNotifications, NotificationSubjectRow } from '#/lib/module';
import { isPushSendConfigured, sendNotificationPush } from '#/modules/push/push-sender';
import { checkAccessFanout } from '#/permissions';
import { buildSubjectFromEntity } from '#/permissions/build-subject';
import { log } from '#/utils/logger';
import { accessForUserIds } from '../helpers/access-for-users';
import { type NotificationType, notificationTypes } from '../notification-db';
import {
  findNotifiedUserIds,
  insertNotificationsIgnoringDuplicates,
  type NotificationInsert,
} from '../notification-queries';
import { getNotificationSource } from '../notification-sources';

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
  const source = entityType ? getNotificationSource(entityType) : undefined;
  if (!entityType || !source) return;
  const { organizationId, tenantId, id: activityId } = event;
  if (!organizationId || !tenantId || !activityId) return;

  const subjectIds = collectSubjectIds(event);
  if (subjectIds.length === 0) return;

  // Batch events carry only permission columns, never `mentions`, so the rows are always re-read.
  const rows = await tenantReadById(tenantId, (tx) => source.loadRows(tx, subjectIds));

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
  entityType: string,
  source: ModuleNotifications,
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

  if (source.resolveRecipients) {
    const recipients = await tenantReadById(tenantId, (tx) => source.resolveRecipients!(tx, row));
    for (const recipient of recipients) add(recipient.userId, recipient.type as NotificationType);
  }

  if (candidates.size === 0) return;

  // An edit must not re-notify people who were already told about this row.
  const notified = event.action === 'update' ? await findNotifiedUserIds(row.id, [...candidates.keys()]) : new Set();
  const fresh = [...candidates.values()].filter((candidate) => !notified.has(candidate.userId));
  if (fresh.length === 0) return;

  const allowed = await filterByReadAccess(entityType, row, fresh);
  if (allowed.length === 0) return;

  const channel = resolveChannel(entityType, row);
  await insertNotificationsIgnoringDuplicates(
    allowed.map<NotificationInsert>((recipient) => ({
      userId: recipient.userId,
      type: recipient.type,
      entityType,
      subjectId: row.id,
      contextId: source.resolveContextId ? source.resolveContextId(row) : row.id,
      channelId: channel.id,
      channelType: channel.type,
      organizationId: event.organizationId as string,
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
    await sendNotificationPush(
      allowed.map((recipient) => recipient.userId),
      { t: 'notif', activityId: event.id as string, channelId: channel.id, type: primaryType },
    );
  }
}

/**
 * Keep only recipients who may actually read the row, then apply mute.
 *
 * Mute silences ambient channel activity but never a direct mention, which is why `mutedTypes`
 * excludes it.
 */
async function filterByReadAccess(
  entityType: string,
  row: NotificationSubjectRow,
  candidates: Candidate[],
): Promise<Candidate[]> {
  const accessByUser = await accessForUserIds(candidates.map((candidate) => candidate.userId));
  const subject = buildSubjectFromEntity(
    entityType as ProductEntityType,
    row as unknown as { id: string; createdBy?: string | null },
  );

  const accesses = candidates.map((candidate) => accessByUser.get(candidate.userId)).filter((a) => a !== undefined);
  if (accesses.length !== candidates.length) return [];

  const decisions = checkAccessFanout(accesses, 'read', subject, { onInvalidMembership: 'deny' });
  const { id: channelId } = resolveChannel(entityType, row);

  return candidates.filter((candidate, index) => {
    if (!decisions[index]?.allowed) return false;
    if (!mutedTypes.has(candidate.type)) return true;

    const muted = accessByUser
      .get(candidate.userId)
      ?.memberships?.some((membership) => membership.channelId === channelId && membership.muted);
    return !muted;
  });
}

/**
 * The row's home channel: deepest non-null ancestor, organization as the fallback.
 *
 * Same rule as `getSeenChannelId`, so a notification and an unseen badge always agree about which
 * channel a row belongs to.
 */
function resolveChannel(entityType: string, row: NotificationSubjectRow): { id: string; type: string } {
  const [deepest] = hierarchy.resolveNonNullAncestors(entityType, row);
  return deepest ? { id: deepest.id, type: deepest.type } : { id: row.organizationId, type: 'organization' };
}
