import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { mailer } from '#/lib/mailer';
import { buildUnsubscribeLink } from '#/modules/notification/helpers/category-token';
import { replaceSignedSrcs } from '#/modules/system/helpers/get-signed-src';
import { findNewsletterRecipients } from '#/modules/system/system-queries';
import type { sendNewsletterBodySchema } from '#/modules/system/system-schema';
import { log } from '#/utils/logger';
import { newsletterEmail } from '../../../../emails';

type SendNewsletterInput = z.infer<typeof sendNewsletterBodySchema> & { toSelf: boolean };

export async function sendNewsletterOp(ctx: UserContext, input: SendNewsletterInput) {
  const user = ctx.var.user;
  const { organizationIds, subject, content, roles, toSelf } = input;

  // Preview sends are addressed only to the initiating admin and need no organization scope.
  const recipientsRecords = toSelf
    ? [{ userId: user.id, email: user.email, name: user.name, orgName: 'TEST EMAIL ORGANIZATION' }]
    : await findNewsletterRecipients(ctx, { organizationIds, roles });

  if (!recipientsRecords.length) throw new AppError(400, 'no_recipients', 'warn');

  // The link's token is derived from the user id and the category; nothing is stored for it.
  const recipients = recipientsRecords.map(({ userId, ...recipient }) => ({
    ...recipient,
    lng: user.language,
    unsubscribeLink: buildUnsubscribeLink(userId, 'newsletter'),
  }));

  const newContent = replaceSignedSrcs(content);

  const staticProps = { content: newContent, subject, testEmail: toSelf };
  await mailer.prepareEmails(newsletterEmail, staticProps, recipients, user.email);

  log.info('Newsletter sent', { count: recipients.length });
}
