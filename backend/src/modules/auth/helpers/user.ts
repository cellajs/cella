import { config } from 'config';
import type { Context } from 'hono';
import { db } from '#/db/db';
import { type InsertUserModel, usersTable } from '#/db/schema/users';
import { errorResponse } from '#/lib/errors';
import { logEvent } from '#/middlewares/logger/log-event';
import { generateUnsubscribeToken } from '#/modules/users/helpers/unsubscribe-token';
import type { OauthProviderOptions } from '#/types/common';
import { checkSlugAvailable } from '../../general/helpers/check-slug';
import { setSessionCookie } from './cookies';
import { insertOauthAccount } from './oauth';
import { sendVerificationEmail } from './verify-email';

// Handle creating a user
export const handleCreateUser = async (
  ctx: Context,
  data: Omit<InsertUserModel, 'unsubscribeToken'>,
  options?: {
    isInvite?: boolean;
    provider?: {
      id: OauthProviderOptions;
      userId: string;
    };
    isEmailVerified?: boolean;
    redirectUrl?: string;
  },
) => {
  // If sign up is disabled, return an error
  if (!config.has.registrationEnabled && !options?.isInvite) return errorResponse(ctx, 403, 'sign_up_disabled', 'warn');

  // Check if the slug is available
  const slugAvailable = await checkSlugAvailable(data.slug);

  try {
    // Insert the user into the database
    const [user] = await db
      .insert(usersTable)
      .values({
        id: data.id,
        slug: slugAvailable ? data.slug : `${data.slug}-${data.id}`,
        firstName: data.firstName,
        email: data.email.toLowerCase(),
        name: data.name,
        unsubscribeToken: generateUnsubscribeToken(data.email),
        language: config.defaultLanguage,
        hashedPassword: data.hashedPassword,
      })
      .returning();

    // If a provider is passed, insert the oauth account
    if (options?.provider) {
      await insertOauthAccount(data.id, options.provider.id, options.provider.userId);
      // await setSessionCookie(ctx, data.id, options.provider.id.toLowerCase());
    }

    // If the email is not verified, send a verification email
    if (!options?.isEmailVerified) {
      sendVerificationEmail(data.email);
    } else {
      await setSessionCookie(ctx, user.id, 'password');
    }
    if (options?.redirectUrl) return ctx.redirect(options.redirectUrl, 302);
    return ctx.json({ success: true }, 200);
  } catch (error) {
    // If the email already exists, return an error
    if (error instanceof Error && error.message.startsWith('duplicate key')) {
      return errorResponse(ctx, 409, 'email_exists', 'warn');
    }

    if (error instanceof Error) {
      const strategy = options?.provider ? options.provider.id : 'EMAIL';
      const errorMessage = error.message;
      logEvent('Error creating user', { strategy, errorMessage }, 'error');
    }

    throw error;
  }
};
