import { and, eq } from 'drizzle-orm';
import { appConfig } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import { AppError } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { tokensTable } from '#/modules/auth/tokens-db';
import { type EmailModel, emailsTable } from '#/modules/user/emails-db';
import { userSelect } from '#/modules/user/helpers/select';
import { usersTable } from '#/modules/user/user-db';
import { hashToken } from '#/utils/hash-token';
import { log } from '#/utils/logger';
import { createDate, TimeSpan } from '#/utils/time-span';
import { emailVerificationEmail } from '../../../../../emails';

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
  const hashedToken = hashToken(newToken);
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

  // Link token to existing email row (only if not already verified by another flow)
  if (!emailInUse) {
    await db
      .update(emailsTable)
      .set({ tokenId: tokenRecord.id })
      .where(and(eq(emailsTable.email, email), eq(emailsTable.userId, user.id), eq(emailsTable.verified, false)));
  }

  // Send email
  const lng = user.language;

  // Create verification link. Concatenate onto backendAuthUrl (which already ends in /auth) so the
  // /api base path is preserved; new URL(absolutePath, backendUrl) would drop it.
  const verificationURL = new URL(`${appConfig.backendAuthUrl}/invoke-token/${tokenRecord.type}/${newToken}`);

  if (redirectPath) verificationURL.searchParams.set('redirect', redirectPath);

  // Prepare & send email
  const staticProps = { verificationLink: verificationURL.toString(), name: user.name };
  const recipients = [{ email, lng }];

  mailer.prepareEmails(emailVerificationEmail, staticProps, recipients);

  if (appConfig.mode === 'development') {
    console.info(`[verification-link] ${email} ${verificationURL.toString()}`);
  }

  log.info('Verification email sent', { userId: user.id });
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
