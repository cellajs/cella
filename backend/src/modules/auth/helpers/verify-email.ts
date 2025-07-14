import { config } from 'config';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { type TokenModel, tokensTable } from '#/db/schema/tokens';
import type { UserModel } from '#/db/schema/users';
import { logEvent } from '#/middlewares/logger/log-event';
import { createDate, TimeSpan } from '#/utils/time-span';
import authRoutes from '../routes';

/**
 * Trigger the backend to send a verification email to the user.
 *
 * @param userId
 */
export const sendVerificationEmail = (userId: string) => {
  try {
    fetch(config.backendAuthUrl + authRoutes.sendVerificationEmail.path, {
      method: authRoutes.sendVerificationEmail.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
  } catch (err) {
    return logEvent('Verification email could not be sent');
  }
};

/**
 * Trigger the backend to send a Oauth verification email to the user.
 *
 * @param linkedOauthAccountId
 */
export const sendOauthVerificationEmail = (linkedOauthAccountId: string) => {
  try {
    fetch(config.backendAuthUrl + authRoutes.sendVerificationEmail.path, {
      method: authRoutes.sendVerificationEmail.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkedOauthAccountId }),
    });
  } catch (err) {
    return logEvent('OAuth verification email could not be sent');
  }
};

/**
 * Create a new email verification token for a user.
 *
 * @param type Token type, e.g. 'email_verification', 'oauth_email_verification'
 * @param user User model to create the token for
 * @returns <TokenMode>
 */
export const createNewVerificationToken = async (type: TokenModel['type'], user: UserModel): Promise<TokenModel> => {
  // Delete previous tokens of the same type
  await db.delete(tokensTable).where(and(eq(tokensTable.userId, user.id), eq(tokensTable.type, type)));

  // Create a new token
  const [tokenRecord] = await db
    .insert(tokensTable)
    .values({
      token: nanoid(40),
      type: type,
      userId: user.id,
      email: user.email,
      createdBy: user.id,
      expiresAt: createDate(new TimeSpan(2, 'h')),
    })
    .returning();

  // If the token type is 'email_verification' → Link it to the user's email
  if (type === 'email_verification') {
    await db
      .insert(emailsTable)
      .values({ email: user.email, userId: user.id, tokenId: tokenRecord.id })
      .onConflictDoUpdate({
        target: emailsTable.email,
        where: eq(emailsTable.verified, false), // Only update if NOT verified
        set: {
          tokenId: tokenRecord.id,
          userId: user.id,
        },
      });
  }

  return tokenRecord;
};
