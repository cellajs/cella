import { config } from 'config';
import { db } from '../../../db/db';
import { type InsertUserModel, usersTable } from '../../../db/schema/users';
import { checkSlugAvailable } from '../../general/helpers/check-slug';
import { sendVerificationEmail } from './verify-email';
import type { Context } from 'hono';
import { errorResponse } from '../../../lib/errors';
import { logEvent } from '../../../middlewares/logger/log-event';
import type { ProviderId } from '../../../types/common';
import { insertOauthAccount } from '../oauth-helpers';
import { setSessionCookie } from './cookies';

// * Handle creating a user
export const handleCreateUser = async (
  ctx: Context,
  data: InsertUserModel,
  options?: {
    provider?: {
      id: ProviderId;
      userId: string;
    };
    isEmailVerified?: boolean;
    redirectUrl?: string;
  },
) => {
  // * If sign up is disabled, return an error
  if (!config.has.signUp) {
    return errorResponse(ctx, 403, 'sign_up_disabled', 'warn', undefined);
  }

  // * Check if the slug is available
  const slugAvailable = await checkSlugAvailable(data.slug, 'USER');

  try {
    // * Insert the user into the database
    const [user] = await db.insert(usersTable).values({
      id: data.id,
      slug: slugAvailable ? data.slug : `${data.slug}-${data.id}`,
      firstName: data.firstName,
      email: data.email.toLowerCase(),
      name: data.name,
      language: config.defaultLanguage,
      hashedPassword: data.hashedPassword,
    }).returning();

    // * If a provider is passed, insert the oauth account
    if (options?.provider) {
      await insertOauthAccount(data.id, options.provider.id, options.provider.userId);
      // await setSessionCookie(ctx, data.id, options.provider.id.toLowerCase());
    }

    // * If the email is not verified, send a verification email
    if (!options?.isEmailVerified) {
      sendVerificationEmail(data.email);
    } else {
      await setSessionCookie(ctx, user.id, 'password');
    }

    return ctx.json({
      success: true,
    });
  } catch (error) {
    // * If the email already exists, return an error
    if (error instanceof Error && error.message.startsWith('duplicate key')) {
      return errorResponse(ctx, 409, 'email_exists', 'warn', undefined);
    }

    logEvent('Error creating user', { strategy: options?.provider ? options.provider.id : 'EMAIL', errorMessage: (error as Error).message }, 'error');

    throw error;
  }
};
