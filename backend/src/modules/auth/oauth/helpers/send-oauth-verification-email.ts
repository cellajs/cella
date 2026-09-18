import { and, eq } from 'drizzle-orm';
import { appConfig } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import { AppError } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { deleteOAuthVerificationTokens } from '#/modules/auth/auth-queries';
import { identitiesTable } from '#/modules/auth/identities-db';
import { tokensTable } from '#/modules/auth/tokens-db';
import { type EmailModel, emailsTable } from '#/modules/user/emails-db';
import { userSelect } from '#/modules/user/helpers/select';
import { usersTable } from '#/modules/user/user-db';
import { hashToken } from '#/utils/hash-token';
import { log } from '#/utils/logger';
import { createDate, TimeSpan } from '#/utils/time-span';
import { oauthVerificationEmail } from '../../../../../emails';

interface Props {
  userId: string;
  identityId: string;
  redirectPath?: string | null;
}

/** Email verification for an OAuth account, proving the OAuth account holder also owns the email address. */
export const sendOAuthVerificationEmail = async ({ userId, identityId, redirectPath }: Props) => {
  const [user] = await db.select(userSelect).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user' });

  const [identity] = await db.select().from(identitiesTable).where(eq(identitiesTable.id, identityId));
  if (!identity) throw new AppError(404, 'not_found', 'warn');

  // The address under verification is the provider's, which may differ from the account's own.
  const email = identity.email ?? user.email;

  const [emailInUse]: (EmailModel | undefined)[] = await db
    .select()
    .from(emailsTable)
    .where(and(eq(emailsTable.email, email), eq(emailsTable.verified, true)));

  if (emailInUse && identity.verified) {
    throw new AppError(409, 'email_exists', 'warn', { entityType: 'user' });
  }

  await deleteOAuthVerificationTokens({ var: { db } }, { userId: user.id, identityId });

  const newToken = nanoid(40);
  const hashedToken = hashToken(newToken);

  const [tokenRecord] = await db
    .insert(tokensTable)
    .values({
      secret: hashedToken,
      type: 'oauth-verification',
      userId: user.id,
      email,
      createdBy: user.id,
      identityId,
      // Kept on the token row (not the emailed URL) so the deep link doesn't leak into email bodies
      redirectPath: redirectPath || null,
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

  const lng = user.language;

  const verificationURL = new URL(`${appConfig.backendAuthUrl}/invoke-token/${tokenRecord.type}/${newToken}`);

  const staticProps = {
    verificationLink: verificationURL.toString(),
    name: user.name,
    providerEmail: email,
    providerName: identity.provider,
  };
  const recipients = [{ email, lng }];

  mailer
    .prepareEmails(oauthVerificationEmail, staticProps, recipients)
    .catch((err) => log.error('Failed to send OAuth verification email', { err }));

  if (appConfig.mode === 'development') {
    console.info(`[verification-link] ${email} ${verificationURL.toString()}`);
  }

  log.info('Verification email sent', { userId: user.id });
};
