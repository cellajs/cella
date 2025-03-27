import { eq } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import { db } from '#/db/db';
import { type TokenModel, tokensTable } from '#/db/schema/tokens';
import type { Env } from '#/lib/context';
import { errorResponse } from '#/lib/errors';
import { isExpiredDate } from '#/utils/time-span';

/**
 * Middleware to get and check the validity of a token, and set token data in context.
 * If all checks pass, the token data is added to the context for further processing in request lifecycle.
 *
 * @param requiredType - `"email_verification" | "password_reset" | "invitation"` Type of token that is required. This parameter ensures that only tokens of the specified type are accepted.
 * @returns Error response or undefined if the token is valid.
 *
 */
export const hasValidToken = (requiredType: TokenModel['type']) =>
  createMiddleware<Env>(async (ctx, next) => {
    // Find token in request
    const token = ctx.req.param('token');
    if (!token) return errorResponse(ctx, 400, 'invalid_request', 'error');

    // Check if token exists
    const [tokenRecord] = await db.select().from(tokensTable).where(eq(tokensTable.token, token));
    if (!tokenRecord) return errorResponse(ctx, 404, `${requiredType}_not_found`, 'warn', undefined, { type: requiredType });

    // If token is expired, return an error
    if (isExpiredDate(tokenRecord.expiresAt)) return errorResponse(ctx, 401, `${requiredType}_expired`, 'warn', undefined, { type: requiredType });

    // Check if token type matches the required type (if specified)
    if (tokenRecord.type !== requiredType) return errorResponse(ctx, 401, 'invalid_token', 'warn', undefined, { type: requiredType });

    // Set token in context
    ctx.set('token', tokenRecord);

    await next();
  });
