import { config } from 'config';
import { db } from '../../../db/db';
import { type InsertUserModel, usersTable } from '../../../db/schema/users';
import { checkSlugAvailable } from '../../general/helpers/check-slug';
import { sendVerificationEmail } from './verify-email';
import type { Context } from 'hono';
import { PostgresError } from 'postgres';
import { errorResponse } from '../../../lib/errors';
import { logEvent } from '../../../middlewares/logger/log-event';
import type { ProviderId } from '../../../types/common';
import { insertOauthAccount } from '../oauth-helpers';
import { setSessionCookie } from './cookies';

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
  if (!config.has.signUp) {
    return errorResponse(ctx, 403, 'sign_up_disabled', 'warn', undefined);
  }

  const slugAvailable = await checkSlugAvailable(data.slug);

  try {
    await db
      .insert(usersTable)
      .values({
        id: data.id,
        slug: slugAvailable ? data.slug : `${data.slug}-${data.id}`,
        firstName: data.firstName,
        email: data.email.toLowerCase(),
        language: config.defaultLanguage,
        hashedPassword: data.hashedPassword,
      });

    if (options?.provider) {
      await insertOauthAccount(data.id, options.provider.id, options.provider.userId);
      await setSessionCookie(ctx, data.id, options.provider.id.toLowerCase());
    }

    if (!options?.isEmailVerified) {
      sendVerificationEmail(data.email);

      if (options?.provider) {
        return ctx.json(
          {
            success: true,
          },
          302,
          {
            Location: `${config.frontendUrl}/auth/verify-email`,
          },
        );
      }
    }

    if (options?.provider) {
      return ctx.json(
        {
          success: true,
        },
        302,
        {
          Location: config.frontendUrl + options.redirectUrl || config.defaultRedirectPath,
        },
      );
    }

    return ctx.json({
      success: true,
    });
  } catch (error) {
    if (error instanceof PostgresError && error.message.startsWith('duplicate key')) {
      // t('common:error.email_exists')
      return errorResponse(ctx, 409, 'email_exists', 'warn', undefined);
    }

    logEvent('Error creating user', { strategy: options?.provider ? options.provider.id : 'EMAIL', errorMessage: (error as Error).message }, 'error');

    throw error;
  }
};
