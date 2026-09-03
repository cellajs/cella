import { appConfig } from 'shared';
import { tenantReadById } from '#/db/tenant-context';
import { mailer } from '#/lib/mailer';
import { log } from '#/utils/logger';
import { mentionEmail } from '../emails/mention-email';
import { buildUnsubscribeLink } from '../helpers/category-token';
import { findChannelNames } from '../helpers/channel-names';
import { htmlToExcerpt } from '../helpers/render-digest-html';
import { findPendingMentionEmails, findUserNames, findVerifiedRecipients, stampEmailed } from '../notification-queries';
import { getNotificationSource } from '../notification-sources';

/** Excerpt length in the email body; longer bodies are truncated. */
const EXCERPT_LENGTH = 250;

/** Notifications handled per pass; a backlog continues on the next event. */
const MAX_PER_RUN = 200;

/**
 * Send instant emails for freshly created mention notifications.
 *
 * Only mentions mail instantly, and only when the recipient has not opted out. Everything mailed
 * here is stamped `emailedAt`, which is what keeps the digest from repeating it.
 */
export async function sendPendingInstantEmails(organizationId: string): Promise<void> {
  const pending = await findPendingMentionEmails(organizationId, MAX_PER_RUN);
  if (pending.length === 0) return;

  const recipients = await findVerifiedRecipients(pending.map((row) => row.userId));
  const byUser = new Map(recipients.map((row) => [row.id, row]));

  const actorNames = await findUserNames([
    ...new Set(pending.map((row) => row.actorId).filter((id): id is string => Boolean(id))),
  ]);
  const channelNames = await findChannelNames(pending.map((row) => row.channelId));

  const sent: string[] = [];

  for (const notification of pending) {
    const user = byUser.get(notification.userId);
    // No verified address: leave emailedAt null so the digest still reaches them in-app.
    if (!user) continue;

    const source = getNotificationSource(notification.entityType);
    if (!source?.loadPreview) continue;

    const preview = await tenantReadById(notification.tenantId, (tx) =>
      source.loadPreview!(tx, notification.subjectId),
    );
    if (!preview) continue;

    await mailer.prepareEmails(
      mentionEmail,
      {
        actorName: notification.actorId ? (actorNames.get(notification.actorId) ?? '') : '',
        channelName: channelNames.get(notification.channelId) ?? '',
      },
      [
        {
          email: user.email,
          // Per recipient, unlike the newsletter path which mails everyone in the sender's language.
          lng: user.language,
          subjectTitle: preview.title,
          excerpt: htmlToExcerpt(preview.body, EXCERPT_LENGTH),
          link: source.resolveEmailLink?.(notification) ?? appConfig.frontendUrl,
          unsubscribeLink: buildUnsubscribeLink(user.id, 'mention'),
        },
      ],
    );

    sent.push(notification.id);
  }

  if (sent.length === 0) return;

  await stampEmailed(sent);
  log.info('Mention emails sent', { count: sent.length, organizationId });
}
