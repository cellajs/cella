import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { mailer } from '#/lib/mailer';
import { buildUnsubscribeLink } from '#/modules/notification/helpers/category-token';
import { withPublicImageUrls } from '#/modules/system/helpers/with-public-image-urls';
import { findNewsletterRecipients } from '#/modules/system/system-queries';
import type { sendNewsletterBodySchema } from '#/modules/system/system-schema';
import { log } from '#/utils/logger';
import { newsletterEmail } from '../../../../emails';

type SendNewsletterInput = z.infer<typeof sendNewsletterBodySchema> & { toSelf: boolean };

/**
 * Mails the newsletter to the subscribed members of the chosen organizations who hold one of `roles`, or only to the
 * sending admin for a preview (`toSelf`). Every recipient reads it in the sender's language.
 * @throws AppError 400 `no_recipients` when no member qualifies.
 */
export async function sendNewsletterOp(ctx: UserContext, input: SendNewsletterInput) {
  const user = ctx.var.user;
  const { organizationIds, subject, content, roles, toSelf } = input;

  // Preview sends are addressed only to the initiating admin and need no organization scope.
  const recipientsRecords = toSelf
    ? [{ userId: user.id, email: user.email, name: user.name }]
    : await findNewsletterRecipients(ctx, { organizationIds, roles });

  if (!recipientsRecords.length) throw new AppError(400, 'no_recipients', 'warn');

  const recipients = recipientsRecords.map(({ userId, ...recipient }) => ({
    ...recipient,
    lng: user.language,
    unsubscribeLink: buildUnsubscribeLink(userId, 'newsletter'),
  }));

  const newContent = withPublicImageUrls(content);

  const staticProps = { content: newContent, subject, testEmail: toSelf };
  await mailer.prepareEmails(newsletterEmail, staticProps, recipients, user.email);

  log.info('Newsletter sent', { count: recipients.length });
}
