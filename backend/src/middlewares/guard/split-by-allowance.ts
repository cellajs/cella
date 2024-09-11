import { eq } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { resolveEntities } from '#/lib/entity';
import { errorResponse } from '#/lib/errors';
import permissionManager from '#/lib/permission-manager';
import type { Env } from '#/types/app';
import type { Entity } from '#/types/common';
import { logEvent } from '../logger/log-event';

/**
 * Middleware that splits a list of IDs into allowed and disallowed by checking user permissions.
 * @param {string} action - The action to be performed (e.g., 'update', 'delete').
 * @param {string} entityType - The type of the entity (e.g., 'organization', 'workspace').
 * @returns {MiddlewareHandler<Env, any>} MiddlewareHandler to protect routes based on user permissions.
 */
const splitByAllowance =
  // biome-ignore lint/suspicious/noExplicitAny: it's required to use `any` here
    (action: string, entityType: Entity): MiddlewareHandler<Env, any> =>
    async (ctx: Context, next) => {
      // Extract user
      const user = ctx.get('user');

      // Convert the ids to an array
      const rawIds = ctx.req.query('ids');
      const ids = (Array.isArray(rawIds) ? rawIds : [rawIds]).map(String);

      // Check if ids are missing
      if (!rawIds || !ids.length) {
        return errorResponse(ctx, 404, 'not_found', 'warn', entityType, { user: user?.id });
      }

      // Resolve ids
      const entities = await resolveEntities(entityType, ids);

      // Fetch user's memberships from the database
      const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, user.id));

      // Logic to split ids based on permissions
      const allowedIds: string[] = [];
      const disallowedIds: string[] = [];

      for (const entity of entities) {
        const isAllowed = permissionManager.isPermissionAllowed(memberships, action, entity);

        if (!isAllowed && user.role !== 'admin') {
          disallowedIds.push(entity.id);
        } else {
          allowedIds.push(entity.id);
        }
      }

      // Check if user or context is missing
      if (!allowedIds.length) {
        return errorResponse(ctx, 403, 'forbidden', 'warn', entityType.toUpperCase() as Entity, { user: user.id });
      }

      // Attach the split IDs to the context
      ctx.set('memberships', memberships);
      ctx.set('allowedIds', allowedIds);
      ctx.set('disallowedIds', disallowedIds);

      // Log user allowance in the context
      logEvent(`User is allowed to ${action} a list of ${entityType}s`, { user: user.id });

      await next();
    };

export default splitByAllowance;
