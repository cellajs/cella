import { eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono/types';
import { db } from '#/db/db';
import { type TokenModel, tokensTable } from '#/db/schema/tokens';
import { errorResponse } from '#/lib/errors';
import { isExpiredDate } from '#/utils/time-span';

// Middleware to get and check the validity of a token, and set token data in context
export const hasValidToken = (requiredType: TokenModel['type']): MiddlewareHandler => {
  return async (ctx, next) => {
    // Find token in request
    const token = ctx.req.param('token');
    if (!token) return errorResponse(ctx, 400, 'invalid_request', 'warn');

    // Check if token exists
    const [tokenRecord] = await db.select().from(tokensTable).where(eq(tokensTable.token, token));
    if (!tokenRecord) return errorResponse(ctx, 404, 'token_not_found', 'warn');

    // If token is expired, return an error
    if (isExpiredDate(tokenRecord.expiresAt)) return errorResponse(ctx, 401, 'expired_token', 'warn', undefined);

    // Check if token type matches the required type (if specified)
    if (tokenRecord.type !== requiredType) return errorResponse(ctx, 401, 'invalid_token', 'warn');

    // Set token in context
    ctx.set('token', tokenRecord);

    await next();
  };
};
