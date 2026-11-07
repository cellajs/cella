import { appConfig } from 'shared';
import { textFromDocument } from 'shared/blocknote';
import { buildNotificationLink } from 'shared/utils/notification-link';
import { baseDb } from '#/db/db';
import { mailer } from '#/lib/mailer';
import type { NotificationSubjectRow } from '#/lib/module';
import { commentEmail } from '#/modules/notification/emails/comment-email';
import { mentionEmail } from '#/modules/notification/emails/mention-email';
import { buildUnsubscribeLink } from '#/modules/notification/helpers/category-token';
import { htmlToExcerpt } from '#/modules/notification/helpers/render-digest-html';
import { instantEmailKinds } from '#/modules/notification/notification-kinds';
import {
  findChannelLabels,
  findUsersMinimal,
  findVerifiedRecipients,
  stampEmailed,
  type WrittenNotification,
} from '#/modules/notification/notification-queries';
import { findContextNames } from '#/modules/notification/notification-sources';
import { log } from '#/utils/logger';

/** Excerpt length in the email body; longer bodies are truncated. */
const excerptLength = 250;

/** Runs from the fan-out, outside any request. */
const dbCtx = { var: { db: baseDb } };

/**
 * Mails the rows a fan-out just wrote: a mention, and a comment or reply when the app sets `has.commentEmail`
 * (`instantEmailKinds`), each to a recipient with a verified address who keeps that category on (comment email is
 * opt-in). The mail is titled with the context name the inbox shows and quotes the subject's body. A row is stamped
 * `emailedAt` right after its mail went out, so the digest skips it; any other row, a failed send included, stays for
 * the digest.
 * @param subjects - The subject rows the fan-out read, with their body, keyed by id.
 */
export async function sendInstantEmails(rows: WrittenNotification[], subjects: Map<string, NotificationSubjectRow>): Promise<void> {
  const kinds = instantEmailKinds();
  const instant = rows.filter((row) => kinds.includes(row.kind));
  if (instant.length === 0) return;

  const recipients = await findVerifiedRecipients(dbCtx, { userIds: instant.map((row) => row.userId) });
  const byUser = new Map(recipients.map((row) => [row.id, row]));
  const mailable = instant.filter((row) => {
    const user = byUser.get(row.userId);
    return row.kind === 'mention' ? user?.mentionEmail : user?.commentEmail;
  });
  if (mailable.length === 0) return;

  const actors = await findUsersMinimal(dbCtx, { userIds: mailable.map((row) => row.actorId).filter((id): id is string => id !== null) });
  const channels = await findChannelLabels(dbCtx, { channelIds: mailable.map((row) => row.channelId) });
  const titles = await findContextNames(mailable.map((row) => ({ ...row, id: contextOf(row) })));

  let mailed = 0;

  for (const notification of mailable) {
    const user = byUser.get(notification.userId);
    const subject = subjects.get(notification.subjectId);
    if (!user || !subject) continue;

    try {
      const statics = {
        actorName: notification.actorId ? (actors.get(notification.actorId)?.name ?? '') : '',
        channelName: channels.get(notification.channelId)?.name ?? '',
      };
      const recipient = {
        email: user.email,
        lng: user.languageCode,
        name: user.name,
        subjectTitle: titles.get(contextOf(notification)) ?? '',
        excerpt: htmlToExcerpt(descriptionText(subject.description), excerptLength),
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

      if (notification.kind === 'mention') {
        await mailer.sendEmails(mentionEmail, statics, [{ ...recipient, unsubscribeLink: buildUnsubscribeLink(user.id, 'mention') }]);
      } else {
        await mailer.sendEmails(commentEmail, { ...statics, reply: notification.kind === 'reply' }, [
          { ...recipient, unsubscribeLink: buildUnsubscribeLink(user.id, 'comment') },
        ]);
      }
      // Per send: a process that stops in the loop leaves only the row in flight for the digest to mail again.
      await stampEmailed(dbCtx, { ids: [notification.id] });
      mailed++;
    } catch (err) {
      log.error('Instant notification email or its stamp failed', { err, notificationId: notification.id });
    }
  }

  if (mailed > 0) log.info('Instant notification emails sent', { count: mailed });
}

/** The id a row is titled by: its context, else the subject itself, as the inbox titles it. */
function contextOf(row: WrittenNotification): string {
  return row.contextId ?? row.subjectId;
}

/** Plain text of a stored body for the excerpt: block documents flatten, legacy HTML passes through. */
function descriptionText(description: NotificationSubjectRow['description']): string {
  if (!description) return '';
  return textFromDocument(description) ?? description;
}
