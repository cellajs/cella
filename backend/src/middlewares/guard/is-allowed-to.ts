import { eq } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { db } from '#/db/db';
import { membershipSelect, membershipsTable } from '#/db/schema/memberships';
import { getContextUser } from '#/lib/context';
import { resolveEntity } from '#/lib/entity';
import { errorResponse } from '#/lib/errors';
import permissionManager, { HierarchicalEntity } from '#/lib/permission-manager';
import type { Env } from '#/types/app';
import type { ContextEntity, Entity, ProductEntity } from '#/types/common';
import { logEvent } from '../logger/log-event';

export type PermissionAction = 'create' | 'update' | 'read' | 'delete';

/**
 * Middleware to protect routes by checking user permissions.
 * @param action - The action to be performed (e.g. 'read').
 * @param type - The type of the entity (e.g. 'user', 'organization') or product ('task').
 * @returns MiddlewareHandler to protect routes based on user permissions.
 */

const isAllowedTo =
  // biome-ignore lint/suspicious/noExplicitAny: it's required to use `any` here
    (action: PermissionAction, type: ContextEntity | ProductEntity): MiddlewareHandler<Env, any> =>
    async (ctx: Context, next) => {
      // Extract user
      const user = getContextUser();

      // Retrieve the context of the entity to be authorized (e.g., 'organization', 'workspace')
      const contextEntity = await getEntityContext(ctx, type);

      // Check if user or context is missing
      if (!contextEntity || !user) {
        return errorResponse(ctx, 404, 'not_found', 'warn', type, { user: user?.id, id: contextEntity?.id || '' });
      }

      // Fetch user's memberships from the database
      const memberships = await db.select(membershipSelect).from(membershipsTable).where(eq(membershipsTable.userId, user.id));

      // Check if the user is allowed to perform the action in the given context
      const isAllowed = permissionManager.isPermissionAllowed(memberships, action, contextEntity);

      // If not allowed and not admin, return forbidden
      if (!isAllowed && user.role !== 'admin') {
        return errorResponse(ctx, 403, 'forbidden', 'warn', type, { user: user.id, id: contextEntity.id });
      }

      // Store user memberships and authorized context entity in hono ctx
      ctx.set('memberships', memberships);
      ctx.set(type, contextEntity);

      // Log user allowance in the context
      logEvent(`User is allowed to ${action} ${type}`, { user: user.id, id: contextEntity.id });

      await next();
    };

/**
 * Get the context based on the entity type.
 * Handles resolve for both direct entity operations (retrieval, update, deletion) and contextual operations (fetching child entities).
 * @param ctx - The context object containing request and response details.
 * @param entityType - The type of the entity (e.g., 'organization', 'workspace').
 */

// biome-ignore lint/suspicious/noExplicitAny: Prevent assignable errors
async function getEntityContext(ctx: any, entityType: Entity) {
  // Check if entity is configured; if not, return early
  if (!HierarchicalEntity.instanceMap.has(entityType)) {
    return;
  }

  // Extract entity id or slug from request params or query
  const idOrSlug = ctx.req.param('idOrSlug') || ctx.req.query(`${entityType}Id` || ctx.req.param('id'));

  if (idOrSlug) {
    // Handles resolve for direct entity operations (retrieval, update, deletion) based on unique identifier (ID or Slug).
    return await resolveEntity(entityType, idOrSlug);
  }

  // Generate a context using the lowest parent for entity operations, such as fetching or creating child entities
  return await createEntityContext(entityType, ctx);
}

/**
 * Creates a context based on the lowest parent for an entity.
 * @param entityType - The type of the entity.
 * @param ctx - The context object containing request and response details.
 */

// biome-ignore lint/suspicious/noExplicitAny: Prevent assignable errors
async function createEntityContext(entityType: Entity, ctx: any) {
  const entity = HierarchicalEntity.instanceMap.get(entityType);

  // Return early if entity is not available
  if (!entity) return;

  // Extract payload from request body, with try/catch to handle potential empty body bug in HONO (see: https://github.com/honojs/hono/issues/2651)
  // biome-ignore lint/suspicious/noExplicitAny: Using 'any' here because the payload can be of any type
  let payload: Record<string, any> = {};
  try {
    payload = await ctx.req.json();
  } catch {
    payload = {};
  }

  // Initialize context to store the custom created context entity based on the lowest possible ancestor
  const context: Record<string, string> = { entity: entityType };

  // Variable to hold the lowest ancestor found
  // biome-ignore lint/suspicious/noExplicitAny: The lowest ancestor can be of different entity types (e.g., organization, workspace, project) or undefined
  let lowestAncestor: any;

  // Iterate over ancestors (from lowest to highest) and determine the lowest ancestor available
  for (const ancestor of entity.descSortedAncestors) {
    // Continue searching for the lowest ancestor if not found yet
    if (!lowestAncestor) {
      // Check if ancestor identifier is provided in params or query
      let lowestAncestorIdOrSlug = (
        ctx.req.param(ancestor.name) ||
        ctx.req.param(`${ancestor.name}Id`) ||
        ctx.req.query(ancestor.name) ||
        ctx.req.query(`${ancestor.name}Id`)
      )?.toLowerCase();

      // If not found in params or query, check if it's provided in the request body
      if (!lowestAncestorIdOrSlug && payload) {
        lowestAncestorIdOrSlug = payload[`${ancestor.name}Id`];
      }

      // If identifier is found, resolve the lowest ancestor
      if (lowestAncestorIdOrSlug) {
        lowestAncestor = await resolveEntity(ancestor.name as Entity, lowestAncestorIdOrSlug);
        if (lowestAncestor) {
          // Set the lowest ancestor as parent in context
          context[`${ancestor.name}Id`] = lowestAncestor.id;
        }
      }
    } else if (lowestAncestor[`${ancestor.name}Id`]) {
      // Resolve ancestors by the parents of the lowest ancestor
      context[`${ancestor.name}Id`] = lowestAncestor[`${ancestor.name}Id`];
    }
  }

  return context;
}

export default isAllowedTo;
