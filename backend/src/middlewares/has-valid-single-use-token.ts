import type { TokenType } from 'config';
import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { deleteAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { getValidSingleUseToken } from '#/utils/get-valid-single-use-token';

/**
 * Middleware to get and check the validity of a single use token from a cookie, set token data in context and remove cookie.
 *
 * @param tokenType - Type of token that is required. This parameter ensures that only tokens of the specified type are accepted.
 * @returns Error response or undefined if the token is valid.
 *
 */
export const hasValidSingleUseToken = (tokenType: TokenType): MiddlewareHandler<Env> =>
  createMiddleware<Env>(async (ctx, next) => {
    if (ctx.req.method !== 'POST') throw new AppError(400, 'insecure_request', 'error');

    // Check if single use token exists and invoke it
    const tokenRecord = await getValidSingleUseToken({ ctx, tokenType });

    // Revoke single use token by deleting cookie
    deleteAuthCookie(ctx, tokenRecord.type);

    // Set token in context
    ctx.set('token', tokenRecord);

    await next();
  });
