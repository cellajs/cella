import { and, eq } from 'drizzle-orm';
import i18n from 'i18next';
import { appConfig } from 'shared';
import { db } from '#/db/db';
import { type EmailModel, emailsTable } from '#/db/schema/emails';
import { tokensTable } from '#/db/schema/tokens';
import { usersTable } from '#/db/schema/users';
import { AppError } from '#/lib/error';
import { mailer } from '#/lib/mailer';
import { userSelect } from '#/modules/user/helpers/select';
import { logEvent } from '#/utils/logger';
import { nanoid } from '#/utils/nanoid';
import { encodeLowerCased } from '#/utils/oslo';
import { createDate, TimeSpan } from '#/utils/time-span';
import { EmailVerificationEmail } from '../../../../../emails';

interface Props {
  userId: string;
  redirectPath?: string;
}

/**
 * Send a verification email to user.
 */
export const sendVerificationEmail = async ({ userId, redirectPath }: Props) => {
  const [user] = await db.select(userSelect).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  // User not found
  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user' });

  const [emailInUse]: (EmailModel | undefined)[] = await db
    .select()
    .from(emailsTable)
    .where(and(eq(emailsTable.email, user.email), eq(emailsTable.verified, true)));

  // email verified
  if (emailInUse) {
    throw new AppError(422, 'email_already_verified', 'warn', { entityType: 'user' });
  }

  // Delete previous token
  await deleteVerificationTokens(user.id, 'email-verification');

  const newToken = nanoid(40);
  const hashedToken = encodeLowerCased(newToken);
  const email = user.email;

  // Create new token
  const [tokenRecord] = await db
    .insert(tokensTable)
    .values({
      secret: hashedToken,
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
  const verifyPath = `/auth/invoke-token/${tokenRecord.type}/${newToken}`;
  const verificationURL = new URL(verifyPath, appConfig.backendUrl);

  if (redirectPath) verificationURL.searchParams.set('redirect', redirectPath);

  // Prepare & send email
  const subjectText = 'backend:email.email_verification.subject';
  const subject = i18n.t(subjectText, { lng, appName: appConfig.name });
  const staticProps = { verificationLink: verificationURL.toString(), subject, lng, name: user.name };
  const recipients = [{ email }];

  mailer.prepareEmails(EmailVerificationEmail, staticProps, recipients);

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
        ...[
          eq(tokensTable.userId, userId),
          eq(tokensTable.type, type),
          ...(oauthAccountId ? [eq(tokensTable.oauthAccountId, oauthAccountId)] : []),
        ],
      ),
    );
};
