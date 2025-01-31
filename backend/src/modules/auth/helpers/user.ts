import type { EnabledOauthProvider } from 'config';
import { config } from 'config';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { db } from '#/db/db';
import { tokensTable } from '#/db/schema/tokens';
import { type InsertUserModel, usersTable } from '#/db/schema/users';
import { errorResponse } from '#/lib/errors';
import { logEvent } from '#/middlewares/logger/log-event';
import { generateUnsubscribeToken } from '#/modules/users/helpers/unsubscribe-token';
import { nanoid } from '#/utils/nanoid';
import { checkSlugAvailable } from '../../general/helpers/check-slug';
import { insertOauthAccount } from './oauth';
import { setUserSession } from './session';
import { sendVerificationEmail } from './verify-email';

interface HandleCreateUserProps {
  ctx: Context;
  newUser: Omit<InsertUserModel, 'unsubscribeToken'>;
  redirectUrl?: string;
  provider?: { id: EnabledOauthProvider; userId: string };
  tokenId?: string;
}

// Handle creating a user by password or oauth provider
export const handleCreateUser = async ({ ctx, newUser, redirectUrl, provider, tokenId }: HandleCreateUserProps) => {
  // Check if slug is available
  const slugAvailable = await checkSlugAvailable(newUser.slug);

  try {
    // Insert new user into database
    const userEmail = newUser.email.toLowerCase();
    const [user] = await db
      .insert(usersTable)
      .values({
        slug: slugAvailable ? newUser.slug : `${newUser.slug}-${nanoid(5)}`,
        firstName: newUser.firstName,
        emailVerified: newUser.emailVerified,
        email: userEmail.toLowerCase(),
        name: newUser.name,
        unsubscribeToken: generateUnsubscribeToken(userEmail),
        language: config.defaultLanguage,
        hashedPassword: newUser.hashedPassword,
      })
      .returning();

    // If a provider is passed, insert oauth account
    if (provider) await insertOauthAccount(user.id, provider.id, provider.userId);

    // If signing up with token, update it with new user id
    if (tokenId) await db.update(tokensTable).set({ userId: user.id }).where(eq(tokensTable.id, tokenId));

    // If email is not verified, send verification email. Otherwise, sign in user
    if (!user.emailVerified) sendVerificationEmail(user.id);
    else await setUserSession(ctx, user.id, provider?.id || 'password');

    // Redirect to URL if provided
    if (redirectUrl) return ctx.redirect(redirectUrl, 302);

    // Return
    return ctx.json({ success: true }, 200);
  } catch (error) {
    // If the email already exists, return an error
    if (error instanceof Error && error.message.startsWith('duplicate key')) {
      return errorResponse(ctx, 409, 'email_exists', 'warn');
    }

    if (error instanceof Error) {
      const strategy = provider ? provider.id : 'password';
      const errorMessage = error.message;
      logEvent('Error creating user', { strategy, errorMessage }, 'error');
    }

    throw error;
  }
};
