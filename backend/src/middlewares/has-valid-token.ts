import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { TokenModel } from '#/db/schema/tokens';
import type { Env } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { deleteAuthCookie } from '#/modules/auth/helpers/cookie';
import { getValidSingleUseToken } from '#/utils/get-valid-single-use-token';

/**
 * Middleware to get and check the validity of a single use token from a cookie, set token data in context and remove cookie.
 *
 * @param tokenType - Type of token that is required. This parameter ensures that only tokens of the specified type are accepted.
 * @returns Error response or undefined if the token is valid.
 *
 */
// TODO how to provide additional security against CSRF for endpoints using the cookie with hasValidToken middleware?
// Can this middleware be used to directly check a CRSF token?
export const hasValidToken = (tokenType: TokenModel['type']): MiddlewareHandler<Env> =>
  createMiddleware<Env>(async (ctx, next) => {
    if (ctx.req.method !== 'POST') throw new AppError({ status: 400, type: 'insecure_request', severity: 'error' });

    // Check if single use token exists and consume it
    const tokenRecord = await getValidSingleUseToken({ ctx, tokenType });

    // Revoke single use token by deleting cookie
    deleteAuthCookie(ctx, tokenType);

    // Set token in context
    ctx.set('token', tokenRecord);

    await next();
  });
