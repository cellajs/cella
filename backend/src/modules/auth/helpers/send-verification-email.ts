import { appConfig } from 'config';
import { and, eq } from 'drizzle-orm';
import i18n from 'i18next';
import { db } from '#/db/db';
import { type EmailModel, emailsTable } from '#/db/schema/emails';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { tokensTable } from '#/db/schema/tokens';
import type { UserModel } from '#/db/schema/users';
import { AppError } from '#/lib/errors';
import { mailer } from '#/lib/mailer';
import { getUserBy } from '#/modules/users/helpers/get-user-by';
import { logEvent } from '#/utils/logger';
import { nanoid } from '#/utils/nanoid';
import { createDate, TimeSpan } from '#/utils/time-span';
import { EmailVerificationEmail, type EmailVerificationEmailProps } from '../../../../emails/email-verification';

interface Props {
  userId?: string;
  tokenId?: string;
  oauthAccountId?: string;
  redirectPath?: string;
}

/**
 * Send a verification email to user.
 */
export const sendVerificationEmail = async ({ userId, oauthAccountId, redirectPath, tokenId }: Props) => {
  let user: UserModel | null = null;

  // Get user
  if (userId) user = await getUserBy('id', userId);
  else if (tokenId) {
    const [tokenRecord] = await db.select().from(tokensTable).where(eq(tokensTable.id, tokenId));
    if (!tokenRecord || !tokenRecord.userId) throw new AppError({ status: 404, type: 'not_found', severity: 'warn' });
    user = await getUserBy('id', tokenRecord.userId);
  }

  // User not found
  if (!user) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'user' });

  // OAuthAccountId is provided and doesnt exist
  const [oauthAccount] = oauthAccountId ? await db.select().from(oauthAccountsTable).where(eq(oauthAccountsTable.id, oauthAccountId)) : [];
  if (oauthAccountId && !oauthAccount) throw new AppError({ status: 404, type: 'not_found', severity: 'warn' });

  const [emailInUse]: (EmailModel | undefined)[] = await db
    .select()
    .from(emailsTable)
    .where(and(eq(emailsTable.email, user.email), eq(emailsTable.verified, true)));

  // email verified (+ optional OAuthAccount verified)
  if (emailInUse && (!oauthAccountId || oauthAccount.verified)) {
    throw new AppError({ status: 409, type: 'email_exists', severity: 'warn', entityType: 'user' });
  }

  // Delete previous token
  await db
    .delete(tokensTable)
    .where(
      and(
        ...[
          eq(tokensTable.userId, user.id),
          eq(tokensTable.type, 'email_verification'),
          ...(oauthAccountId ? [eq(tokensTable.oauthAccountId, oauthAccountId)] : []),
        ],
      ),
    );

  const token = nanoid(40);
  const email = oauthAccount?.email ?? user.email;

  const [tokenRecord] = await db
    .insert(tokensTable)
    .values({
      token,
      type: 'email_verification',
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

  // Create verification link
  const verifyPath = !oauthAccount ? `/auth/verify-email/${token}` : `/auth/${oauthAccount.providerId}`;
  const verificationLink = new URL(verifyPath, appConfig.backendAuthUrl);

  // Add query parameters
  if (!oauthAccount) {
    verificationLink.searchParams.set('tokenId', tokenRecord.id);
  }

  if (oauthAccount) {
    verificationLink.searchParams.set('token', token);
    verificationLink.searchParams.set('type', 'verify');
  }

  if (redirectPath) {
    verificationLink.searchParams.set('redirect', encodeURIComponent(redirectPath));
  }

  // Prepare & send email
  const subject = i18n.t('backend:email.email_verification.subject', { lng, appName: appConfig.name });
  const staticProps = { verificationLink, subject, lng };
  const recipients = [{ email }];

  type Recipient = { email: string };

  mailer.prepareEmails<EmailVerificationEmailProps, Recipient>(EmailVerificationEmail, staticProps, recipients);

  logEvent({ msg: 'Verification email sent', meta: { user: user.id } });
};
