import { appConfig } from 'config';
import { and, eq } from 'drizzle-orm';
import i18n from 'i18next';
import { db } from '#/db/db';
import { type EmailModel, emailsTable } from '#/db/schema/emails';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { tokensTable } from '#/db/schema/tokens';
import { usersTable } from '#/db/schema/users';
import { AppError } from '#/lib/error';
import { mailer } from '#/lib/mailer';
import { deleteVerificationTokens } from '#/modules/auth/general/helpers/send-verification-email';
import { userSelect } from '#/modules/users/helpers/select';
import { logEvent } from '#/utils/logger';
import { nanoid } from '#/utils/nanoid';
import { encodeLowerCased } from '#/utils/oslo';
import { createDate, TimeSpan } from '#/utils/time-span';
import { OAuthVerificationEmail, type OAuthVerificationEmailProps } from '../../../../../emails';

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
  const [user] = await db.select(userSelect).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  // User not found
  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user' });

  // OAuthAccountId is provided and doesnt exist
  const [oauthAccount] = await db.select().from(oauthAccountsTable).where(eq(oauthAccountsTable.id, oauthAccountId));
  if (!oauthAccount) throw new AppError(404, 'not_found', 'warn');

  const [emailInUse]: (EmailModel | undefined)[] = await db
    .select()
    .from(emailsTable)
    .where(and(eq(emailsTable.email, user.email), eq(emailsTable.verified, true)));

  // email and oauthAccount verified
  if (emailInUse && oauthAccount.verified) {
    throw new AppError(409, 'email_exists', 'warn', { entityType: 'user' });
  }

  // Delete previous token
  await deleteVerificationTokens(user.id, 'oauth-verification', oauthAccountId);

  const newToken = nanoid(40);
  const hashedToken = encodeLowerCased(newToken);
  const email = oauthAccount?.email ?? user.email;

  // Create new token
  const [tokenRecord] = await db
    .insert(tokensTable)
    .values({
      token: hashedToken,
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
  const verifyPath = `/auth/invoke-token/${tokenRecord.type}/${newToken}`;
  const verificationURL = new URL(verifyPath, appConfig.backendUrl);

  if (redirectPath) verificationURL.searchParams.set('redirectAfter', redirectPath);

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
