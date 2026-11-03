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
  findUsersMinimal,
  findVerifiedRecipients,
  stampEmailed,
  type WrittenNotification,
} from '#/modules/notification/notification-queries';
import { getNotificationSource, loadSubjectPreview } from '#/modules/notification/notification-sources';
import { instantEmailTypes } from '#/modules/notification/notification-types';
import { log } from '#/utils/logger';

/** Excerpt length in the email body; longer bodies are truncated. */
const excerptLength = 250;

/** Runs from the fan-out, outside any request. */
const dbCtx = { var: { db: baseDb } };

/**
 * Mails the rows a fan-out just wrote: a mention, and a comment or reply when the app sets `has.commentEmail`
 * (`instantEmailTypes`), each to a recipient with a verified address who keeps that category on (comment email is
 * opt-in). A row whose mail went out is stamped `emailedAt`, so the digest skips it; any other row, a failed send
 * included, stays for the digest.
 */
export async function sendInstantEmails(rows: WrittenNotification[]): Promise<void> {
  const types = instantEmailTypes();
  const typed = rows.filter((row) => types.includes(row.type));
  if (typed.length === 0) return;

  const recipients = await findVerifiedRecipients(dbCtx, { userIds: typed.map((row) => row.userId) });
  const byUser = new Map(recipients.map((row) => [row.id, row]));
  const mailable = typed.filter((row) => {
    const user = byUser.get(row.userId);
    return row.type === 'mention' ? user?.mentionEmail : user?.commentEmail;
  });
  if (mailable.length === 0) return;

  const actors = await findUsersMinimal(dbCtx, { userIds: mailable.map((row) => row.actorId).filter((id): id is string => id !== null) });
  const channelNames = await findChannelNames(dbCtx, { channelIds: mailable.map((row) => row.channelId) });

  const mailed: string[] = [];

  for (const notification of mailable) {
    const user = byUser.get(notification.userId);
    const source = getNotificationSource(notification.entityType);
    if (!user || !source) continue;

    try {
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
      mailed.push(notification.id);
    } catch (err) {
      log.error('Instant notification email failed', { err, notificationId: notification.id });
    }
  }

  await stampEmailed(dbCtx, { ids: mailed });
  if (mailed.length > 0) log.info('Instant notification emails sent', { count: mailed.length });
}
