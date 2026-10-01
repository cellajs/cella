import { appConfig } from 'shared';
import { buildNotificationLink } from 'shared/utils/notification-link';
import { tenantReadById } from '#/db/tenant-context';
import { mailer } from '#/lib/mailer';
import { log } from '#/utils/logger';
import { commentEmail } from '../emails/comment-email';
import { mentionEmail } from '../emails/mention-email';
import { accessForUserIds } from '../helpers/access-for-users';
import { buildUnsubscribeLink } from '../helpers/category-token';
import { findChannelNames } from '../helpers/channel-names';
import { findReadableSubjectIds } from '../helpers/readable-subjects';
import { htmlToExcerpt } from '../helpers/render-digest-html';
import { findPendingInstantEmails, findUserNames, findVerifiedRecipients, stampEmailed } from '../notification-queries';
import { getNotificationSource, loadSubjectPreview } from '../notification-sources';

/** Excerpt length in the email body; longer bodies are truncated. */
const EXCERPT_LENGTH = 250;

/**
 * Notifications handled per pass. A pass runs after each fan-out in the organization that wrote a
 * mailable row, so a backlog beyond this drains on the next one.
 */
const MAX_PER_RUN = 200;

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
  const pending = await findPendingInstantEmails(organizationId, MAX_PER_RUN);
  if (pending.length === 0) return;

  const recipients = await findVerifiedRecipients(pending.map((row) => row.userId));
  const byUser = new Map(recipients.map((row) => [row.id, row]));
  const readableByUser = await findReadableByUser(pending);

  const actorIds = [...new Set(pending.map((row) => row.actorId).filter((id): id is string => Boolean(id)))];
  const actorNames = await findUserNames(actorIds);
  const channelNames = await findChannelNames(pending.map((row) => row.channelId));

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
      actorName: notification.actorId ? (actorNames.get(notification.actorId) ?? '') : '',
      channelName: channelNames.get(notification.channelId) ?? '',
    };
    const recipient = {
      email: user.email,
      // Per recipient, unlike the newsletter path which mails everyone in the sender's language.
      lng: user.language,
      subjectTitle: preview.title,
      excerpt: htmlToExcerpt(preview.body, EXCERPT_LENGTH),
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
      await mailer.prepareEmails(mentionEmail, statics, [{ ...recipient, unsubscribeLink: buildUnsubscribeLink(user.id, 'mention') }]);
    } else {
      await mailer.prepareEmails(commentEmail, { ...statics, reply: notification.type === 'reply' }, [
        { ...recipient, unsubscribeLink: buildUnsubscribeLink(user.id, 'comment') },
      ]);
    }

    sent++;
  }

  await stampEmailed(pending.map((row) => row.id));
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
  const accessByUser = await accessForUserIds(pending.map((row) => row.userId));
  const readableByUser = new Map<string, Set<string>>();
  for (const [userId, access] of accessByUser) {
    const refs = pending.filter((row) => row.userId === userId);
    readableByUser.set(userId, await findReadableSubjectIds(access, refs));
  }
  return readableByUser;
}
