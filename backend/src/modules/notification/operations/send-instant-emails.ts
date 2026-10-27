import { appConfig } from 'shared';
import { buildNotificationLink } from 'shared/utils/notification-link';
import { baseDb } from '#/db/db';
import { tenantReadById } from '#/db/tenant-context';
import { mailer } from '#/lib/mailer';
import { commentEmail } from '#/modules/notification/emails/comment-email';
import { mentionEmail } from '#/modules/notification/emails/mention-email';
import { buildUnsubscribeLink } from '#/modules/notification/helpers/category-token';
import { htmlToExcerpt } from '#/modules/notification/helpers/render-digest-html';
import {
  findChannelNames,
  findPendingInstantEmails,
  findUsersMinimal,
  findVerifiedRecipients,
  getUserAccess,
  stampEmailed,
} from '#/modules/notification/notification-queries';
import { getNotificationSource, loadSubjectPreview } from '#/modules/notification/notification-sources';
import { findReadableSubjectIds } from '#/modules/notification/operations/readable-subjects';
import { log } from '#/utils/logger';

/** Excerpt length in the email body; longer bodies are truncated. */
const excerptLength = 250;

/**
 * Notifications handled per pass. A pass runs after each fan-out in the organization that wrote a
 * mailable row, so a backlog beyond this drains on the next one.
 */
const maxPerRun = 200;

/** Runs after a fan-out, outside any request. */
const dbCtx = { var: { db: baseDb } };

type PendingEmail = Awaited<ReturnType<typeof findPendingInstantEmails>>[number];

/**
 * Send instant emails for freshly created mention notifications, and for comment and reply
 * notifications when the app sets `has.commentEmail` (`instantEmailTypes`).
 *
 * A row mails only when the recipient has not opted out (comment email is opt-in) and may still
 * read the subject: access can end between the fan-out and this pass. One mail per recipient and
 * subject, a mention before a comment or reply. Every row the pass takes is stamped `emailedAt`,
 * mailed, folded into another row's mail or skipped for good (no verified address, access or
 * subject gone): the digest never repeats a mailed row, and a skipped row never holds up the next
 * pass.
 */
export async function sendPendingInstantEmails(organizationId: string): Promise<void> {
  const pending = await findPendingInstantEmails(dbCtx, { organizationId, limit: maxPerRun });
  if (pending.length === 0) return;

  const recipients = await findVerifiedRecipients(dbCtx, { userIds: pending.map((row) => row.userId) });
  const byUser = new Map(recipients.map((row) => [row.id, row]));
  const readableByUser = await findReadableByUser(pending);

  const actors = await findUsersMinimal(dbCtx, { userIds: pending.map((row) => row.actorId).filter((id): id is string => id !== null) });
  const channelNames = await findChannelNames(dbCtx, { channelIds: pending.map((row) => row.channelId) });

  let sent = 0;

  for (const notification of oneRowPerSubject(pending)) {
    const user = byUser.get(notification.userId);
    if (!user) continue;
    if (!readableByUser.get(notification.userId)?.has(notification.subjectId)) continue;

    const source = getNotificationSource(notification.entityType);
    if (!source) continue;

    const preview = await tenantReadById(notification.tenantId, (tx) => loadSubjectPreview(source, tx, notification.subjectId));
    if (!preview) continue;

    const statics = {
      actorName: notification.actorId ? (actors.get(notification.actorId)?.name ?? '') : '',
      channelName: channelNames.get(notification.channelId) ?? '',
    };
    const recipient = {
      email: user.email,
      lng: user.language,
      name: user.name,
      subjectTitle: preview.title,
      excerpt: htmlToExcerpt(preview.body, excerptLength),
      link: buildNotificationLink(appConfig.frontendUrl, {
        tenantId: notification.tenantId,
        organizationId: notification.organizationId,
        channelId: notification.channelId,
        channelType: notification.channelType,
        entityType: notification.entityType,
        subjectId: notification.subjectId,
        contextId: notification.contextId ?? undefined,
        nid: notification.id,
      }),
    };

    if (notification.type === 'mention') {
      await mailer.sendEmails(mentionEmail, statics, [{ ...recipient, unsubscribeLink: buildUnsubscribeLink(user.id, 'mention') }]);
    } else {
      await mailer.sendEmails(commentEmail, { ...statics, reply: notification.type === 'reply' }, [
        { ...recipient, unsubscribeLink: buildUnsubscribeLink(user.id, 'comment') },
      ]);
    }

    sent++;
  }

  await stampEmailed(dbCtx, { ids: pending.map((row) => row.id) });
  if (sent > 0) log.info('Instant notification emails sent', { count: sent, organizationId });
}

/** The row each recipient and subject is mailed for: the first mention, else the first comment or reply. */
function oneRowPerSubject(pending: PendingEmail[]): PendingEmail[] {
  const chosen = new Map<string, PendingEmail>();
  for (const row of pending) {
    const key = `${row.userId}:${row.subjectId}`;
    const current = chosen.get(key);
    if (!current || (current.type !== 'mention' && row.type === 'mention')) chosen.set(key, row);
  }
  return [...chosen.values()];
}

/** Per recipient, the subjects of their pending rows they may read now. */
async function findReadableByUser(pending: PendingEmail[]) {
  const accessByUser = await getUserAccess(dbCtx, { userIds: pending.map((row) => row.userId) });
  const pendingByUser = Map.groupBy(pending, (row) => row.userId);
  const readableByUser = new Map<string, Set<string>>();
  for (const [userId, access] of accessByUser) {
    readableByUser.set(userId, await findReadableSubjectIds(access, pendingByUser.get(userId) ?? []));
  }
  return readableByUser;
}
