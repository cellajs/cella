import { and, eq } from 'drizzle-orm';
import { appConfig } from 'shared';
import { nanoid } from 'shared/nanoid';
import { AppError } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { type EmailModel, emailsTable } from '#/db/schema/emails';
import { oauthAccountsTable } from '#/db/schema/oauth-accounts';
import { tokensTable } from '#/db/schema/tokens';
import { usersTable } from '#/db/schema/users';
import { mailer } from '#/lib/mailer';
import { deleteVerificationTokens } from '#/modules/auth/general/helpers/send-verification-email';
import { userSelect } from '#/modules/user/helpers/select';
import { type LogContext, logEvent } from '#/utils/logger';
import { encodeLowerCased } from '#/utils/oslo';
import { createDate, TimeSpan } from '#/utils/time-span';
import { oauthVerificationEmail } from '../../../../../emails';

interface Props {
  userId: string;
  oauthAccountId: string;
  redirectPath?: string;
}

/**
 * OAuth email verification (with oauthAccountId): user verifies by email to connect an OAuth account
 * This is done to be sure that the oauth account holder also owns the email address.
 */
export const sendOAuthVerificationEmail = async (
  { userId, oauthAccountId, redirectPath }: Props,
  logCtx: LogContext = null,
) => {
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
      secret: hashedToken,
      type: 'oauth-verification',
      userId: user.id,
      email,
      createdBy: user.id,
      ...(oauthAccountId && { oauthAccountId: oauthAccountId }),
      expiresAt: createDate(new TimeSpan(2, 'h')),
    })
    .returning();

  // Link token to existing email record (only if not already verified by another flow)
  if (!emailInUse) {
    await db
      .update(emailsTable)
      .set({ tokenId: tokenRecord.id })
      .where(and(eq(emailsTable.email, email), eq(emailsTable.userId, user.id), eq(emailsTable.verified, false)));
  }

  // Send email
  const lng = user.language;

  // Create verification link: go to
  const verifyPath = `/auth/invoke-token/${tokenRecord.type}/${newToken}`;
  const verificationURL = new URL(verifyPath, appConfig.backendUrl);

  if (redirectPath) verificationURL.searchParams.set('redirectAfter', redirectPath);

  // Prepare & send email
  const staticProps = {
    verificationLink: verificationURL.toString(),
    name: user.name,
    providerEmail: oauthAccount.email,
    providerName: oauthAccount.provider,
  };
  const recipients = [{ email, lng }];

  mailer.prepareEmails(oauthVerificationEmail, staticProps, recipients);

  logEvent(logCtx, 'info', 'Verification email sent', { userId: user.id });
};
