import { eq } from 'drizzle-orm';
import type { MiddlewareHandler, Context } from 'hono';
import { db } from '../../db/db';
import { membershipsTable } from '../../db/schema/memberships';
import { errorResponse } from '../../lib/errors';
import type { Env } from '../../types/common';
import { logEvent } from '../logger/log-event';
import permissionManager from '../../lib/permission-manager';

/**
 * Middleware to protect routes by checking user permissions.
 * @param action - The action to be performed (e.g., 'read', 'write').
 * @returns MiddlewareHandler to protect routes based on user permissions.
 */
const protect =
  // biome-ignore lint/suspicious/noExplicitAny: it's required to use `any` here
  (action: string): MiddlewareHandler<Env, any> =>
  async (ctx: Context, next) => {
    // Extract user
    const user = ctx.get('user');
    
    // Extract context
    const context = ctx.get('context');

    // Check if user or context is missing
    if (!context || !user) {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'UNKNOWN', { user: user?.id, id: context?.id });
    }

    // Fetch user's memberships from the database
    const memberships = await db
      .select()
      .from(membershipsTable)
      .where(
        eq(membershipsTable.userId, user.id),
      );

    // Check if the user is allowed to perform the action in the given context
    const isAllowed = permissionManager.isPermissionAllowed(memberships, action, context);
  
    // If user is not allowed and not an admin, return a forbidden error
    if (!isAllowed && user.role !== 'ADMIN') {
      return errorResponse(ctx, 403, 'forbidden', 'warn', undefined, { user: user.id, id: context.id });
    }

    // Store the user memberships in the context
    ctx.set('memberships', memberships);

    // Log user authentication in the context
    logEvent(`User authenticated in ${context.id}`, { user: user.id, id: context.id });

    await next();
  };

export default protect;
