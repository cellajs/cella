import type { TokenModel } from '#/db/schema/tokens';
import type { Env } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { getValidToken } from '#/utils/validate-token';
import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';

/**
 * Middleware to get and check the validity of a token, and set token data in context.
 * If all checks pass, the token data is added to the context for further processing in request lifecycle.
 *
 * @param requiredType - `"email_verification" | "password_reset" | "invitation"` Type of token that is required. This parameter ensures that only tokens of the specified type are accepted.
 * @returns Error response or undefined if the token is valid.
 *
 */
export const hasValidToken = (requiredType: TokenModel['type']): MiddlewareHandler<Env> =>
  createMiddleware<Env>(async (ctx, next) => {
    // For email verification, redirect to frontend
    const isRedirect = requiredType === 'email_verification';

    // Find token in request
    const token = ctx.req.param('token');
    if (!token) throw new AppError({ status: 400, type: 'invalid_request', severity: 'error', isRedirect });

    // Check if token exists
    const tokenRecord = await getValidToken({ requiredType, token });

    // Set token in context
    ctx.set('token', tokenRecord);

    await next();
  });
