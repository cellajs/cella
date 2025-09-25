import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { TokenModel } from '#/db/schema/tokens';
import type { Env } from '#/lib/context';
import { getValidSingleUseToken } from '#/utils/get-valid-single-use-token';

/**
 * Middleware to get and check the validity of a single use token from a cookie, set token data in context and remove cookie.
 *
 * @param tokenType - `"email_verification" | "password_reset" | "invitation"` Type of token that is required. This parameter ensures that only tokens of the specified type are accepted.
 * @returns Error response or undefined if the token is valid.
 *
 */
export const hasValidToken = (tokenType: TokenModel['type']): MiddlewareHandler<Env> =>
  createMiddleware<Env>(async (ctx, next) => {
    // Check if single use token exists and consume it
    const tokenRecord = await getValidSingleUseToken({ ctx, tokenType });

    // Set token in context
    ctx.set('token', tokenRecord);

    await next();
  });
