import { db } from '#/db/db';
import { type EmailModel, emailsTable } from '#/db/schema/emails';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { tokensTable } from '#/db/schema/tokens';
import { usersTable } from '#/db/schema/users';
import { AppError } from '#/lib/errors';
import { mailer } from '#/lib/mailer';
import { deleteVerificationTokens } from '#/modules/auth/general/helpers/send-verification-email';
import { usersBaseQuery } from '#/modules/users/helpers/select';
import { logEvent } from '#/utils/logger';
import { nanoid } from '#/utils/nanoid';
import { createDate, TimeSpan } from '#/utils/time-span';
import { appConfig } from 'config';
import { and, eq } from 'drizzle-orm';
import i18n from 'i18next';
import { OAuthVerificationEmail, OAuthVerificationEmailProps } from '../../../../../emails/oauth-verification';

interface Props {
  userId: string;
  oauthAccountId: string;
  redirectPath?: string;
}

/**
 * OAuth email verification (with oauthAccountId): user verifies by email to connect an OAuth account
 * This is done to be sure that the oauth account holder also owns the email address.
 */
export const sendOAuthVerificationEmail = async ({ userId, oauthAccountId, redirectPath }: Props) => {
  const [user] = await usersBaseQuery().where(eq(usersTable.id, userId)).limit(1);

  // User not found
  if (!user) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user' });

  // OAuthAccountId is provided and doesnt exist
  const [oauthAccount] = await db.select().from(oauthAccountsTable).where(eq(oauthAccountsTable.id, oauthAccountId));
  if (!oauthAccount) throw new AppError({ status: 404, type: 'not_found', severity: 'warn' });

  const [emailInUse]: (EmailModel | undefined)[] = await db
    .select()
    .from(emailsTable)
    .where(and(eq(emailsTable.email, user.email), eq(emailsTable.verified, true)));

  // email and oauthAccount verified
  if (emailInUse && oauthAccount.verified) {
    throw new AppError({ status: 409, type: 'email_exists', severity: 'warn', entityType: 'user' });
  }

  // Delete previous token
  await deleteVerificationTokens(user.id, 'oauth-verification', oauthAccountId);

  const token = nanoid(40);
  const email = oauthAccount?.email ?? user.email;

  // Create new token
  const [tokenRecord] = await db
    .insert(tokensTable)
    .values({
      token,
      type: 'oauth-verification',
      userId: user.id,
      email,
      createdBy: user.id,
      ...(oauthAccountId && { oauthAccountId: oauthAccountId }),
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

  const staticOAuthProps = { ...staticProps, providerEmail: oauthAccount.email, providerName: oauthAccount.provider };
  mailer.prepareEmails<OAuthVerificationEmailProps, Recipient>(OAuthVerificationEmail, staticOAuthProps, recipients);

  logEvent('info', 'Verification email sent', { userId: user.id });
};
