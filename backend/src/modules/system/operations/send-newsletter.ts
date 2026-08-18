import { appConfig, type EntityRole } from 'shared';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { mailer } from '#/lib/mailer';
import { replaceSignedSrcs } from '#/modules/system/helpers/get-signed-src';
import { findNewsletterRecipients } from '#/modules/system/system-queries';
import { log } from '#/utils/logger';
import { newsletterEmail } from '../../../../emails';

interface SendNewsletterInput {
  organizationIds: string[];
  subject: string;
  content: string;
  roles: EntityRole[];
  toSelf?: boolean;
}

export async function sendNewsletterOp(ctx: AuthContext, input: SendNewsletterInput) {
  const user = ctx.var.user;
  const { organizationIds, subject, content, roles, toSelf } = input;

  if (!toSelf && organizationIds.length === 0) throw new AppError(400, 'no_recipients', 'warn');

  // Preview sends are addressed only to the initiating admin and need no organization scope.
  const recipientsRecords = toSelf ? [] : await findNewsletterRecipients(ctx, { organizationIds, roles });

  if (!recipientsRecords.length && !toSelf) throw new AppError(400, 'no_recipients', 'warn');

  let recipients = recipientsRecords.map(({ newsletter, unsubscribeToken, ...recipient }) => ({
    ...recipient,
    lng: user.language,
    unsubscribeLink: `${appConfig.backendUrl}/unsubscribe?token=${unsubscribeToken}`,
  }));

  if (toSelf)
    recipients = [
      {
        email: user.email,
        name: user.name,
        lng: user.language,
        unsubscribeLink: `${appConfig.backendUrl}/unsubscribe?token=NOTOKEN`,
        orgName: 'TEST EMAIL ORGANIZATION',
      },
    ];

  const newContent = await replaceSignedSrcs(content);

  const staticProps = { content: newContent, subject, testEmail: toSelf };
  await mailer.prepareEmails(newsletterEmail, staticProps, recipients, user.email);

  log.info('Newsletter sent', { count: recipients.length });
}
