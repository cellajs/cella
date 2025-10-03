import { db } from '#/db/db';
import { type EmailModel, emailsTable } from '#/db/schema/emails';
import { tokensTable } from '#/db/schema/tokens';
import { usersTable } from '#/db/schema/users';
import { AppError } from '#/lib/errors';
import { mailer } from '#/lib/mailer';
import { usersBaseQuery } from '#/modules/users/helpers/select';
import { logEvent } from '#/utils/logger';
import { nanoid } from '#/utils/nanoid';
import { createDate, TimeSpan } from '#/utils/time-span';
import { appConfig } from 'config';
import { and, eq } from 'drizzle-orm';
import i18n from 'i18next';
import { EmailVerificationEmail, type EmailVerificationEmailProps } from '../../../../../emails/email-verification';

interface Props {
  userId: string;
  redirectPath?: string;
}

/**
 * Send a verification email to user.
 */
export const sendVerificationEmail = async ({ userId, redirectPath }: Props) => {
  const [user] = await usersBaseQuery().where(eq(usersTable.id, userId)).limit(1);

  // User not found
  if (!user) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user' });

  const [emailInUse]: (EmailModel | undefined)[] = await db
    .select()
    .from(emailsTable)
    .where(and(eq(emailsTable.email, user.email), eq(emailsTable.verified, true)));

  // email verified
  if (emailInUse) {
    throw new AppError({ status: 422, type: 'email_already_verified', severity: 'warn', entityType: 'user' });
  }

  // Delete previous token
  await deleteVerificationTokens(user.id, 'email-verification');

  const token = nanoid(40);
  const email = user.email;

  // Create new token
  const [tokenRecord] = await db
    .insert(tokensTable)
    .values({
      token,
      type: 'email-verification',
      userId: user.id,
      email,
      createdBy: user.id,
      expiresAt: createDate(new TimeSpan(2, 'h')),
    })
    .returning();

  // Only update when no verified email exists
  if (!emailInUse) {
    await db
      .insert(emailsTable)
      .values({ email, userId: user.id, tokenId: tokenRecord.id })
      .onConflictDoUpdate({
        target: emailsTable.email,
        where: eq(emailsTable.verified, false),
        set: {
          tokenId: tokenRecord.id,
          userId: user.id,
        },
      });
  }

  // Send email
  const lng = user.language;

  // Create verification link: go to
  const verifyPath = `/auth/invoke-token/${tokenRecord.type}/${tokenRecord.token}`;
  const verificationURL = new URL(verifyPath, appConfig.backendUrl);

  if (redirectPath) verificationURL.searchParams.set('redirect', encodeURIComponent(redirectPath));

  // Prepare & send email
  const subjectText = 'backend:email.email_verification.subject';
  const subject = i18n.t(subjectText, { lng, appName: appConfig.name });
  const staticProps = { verificationLink: verificationURL.toString(), subject, lng, name: user.name };
  const recipients = [{ email }];
  type Recipient = { email: string };

  mailer.prepareEmails<EmailVerificationEmailProps, Recipient>(EmailVerificationEmail, staticProps, recipients);

  logEvent('info', 'Verification email sent', { userId: user.id });
};

export const deleteVerificationTokens = async (
  userId: string,
  type: Extract<(typeof appConfig.tokenTypes)[number], 'email-verification' | 'oauth-verification'>,
  oauthAccountId?: string,
) => {
  return await db
    .delete(tokensTable)
    .where(
      and(
        ...[eq(tokensTable.userId, userId), eq(tokensTable.type, type), ...(oauthAccountId ? [eq(tokensTable.oauthAccountId, oauthAccountId)] : [])],
      ),
    );
};
