import { eq, or } from 'drizzle-orm';
import type { MiddlewareHandler, Context } from 'hono';
import { db } from '../../db/db';
import { membershipsTable } from '../../db/schema/memberships';
import { errorResponse } from '../../lib/errors';
import type { Env } from '../../types/common';
import { logEvent } from '../logger/log-event';
import permissionManager from '../../lib/permission-manager';
import { HierarchicalEntity } from '../../lib/permission-manager';

// TODO: Refactor to make schema imports more abstract and modular,
//       so all different schemas don't need to be individually imported/declared.
import { organizationsTable } from '../../db/schema/organizations';
import { workspacesTable } from '../../db/schema/workspaces';

// Create a map to store tables for different resource types
export const tables = new Map<string, typeof organizationsTable | typeof workspacesTable>([
  ['organization', organizationsTable],
  ['workspace', workspacesTable],
]);

/**
 * Middleware to protect routes by checking user permissions.
 * @param resourceType - The type of the resource (e.g., 'organization', 'workspace').
 * @param action - The action to be performed (e.g., 'read', 'write').
 * @returns MiddlewareHandler to protect routes based on user permissions.
 */
const protect =
  // biome-ignore lint/suspicious/noExplicitAny: it's required to use `any` here
  (resourceType: string, action: string): MiddlewareHandler<Env, any> =>
  async (ctx: Context, next) => {
    // Extract user
    const user = ctx.get('user');
    
    // Retrieve the context of the resource to be authorized (e.g., 'organization', 'workspace')
    const context = await getResourceContext(ctx, resourceType)

    // Check if user or context is missing
    if (!context || !user) {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'UNKNOWN', { user: user?.id, id: context?.id || '' });
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

    // Store the user memberships and authorized resource context in the context
    ctx.set('memberships', memberships);
    ctx.set('authorzedIn', context);
    ctx.set(resourceType, context);

    // Log user authentication in the context
    logEvent(`User authenticated in ${context.id}`, { user: user.id, id: context.id });

    await next();
  };

/**
 * Get the context based on the resource type.
 * Handles resolve for both direct resource operations (retrieval, update, deletion) and contextual operations (fetching child resources).
 * @param ctx - The context object containing request and response details.
 * @param resourceType - The type of the resource (e.g., 'organization', 'workspace').
 */

// biome-ignore lint/suspicious/noExplicitAny: Prevent assignable errors
async function getResourceContext (ctx: any, resourceType: string) {
  // Check if resource is configured; if not, return early
  if (!HierarchicalEntity.instanceMap.has(resourceType)) {
    return;
  }

  const idOrSlug = ctx.req.param(resourceType)?.toLowerCase() || ctx.req.query(resourceType)?.toLowerCase();
  if (idOrSlug) {
    // Handles resolve for direct resource operations (retrieval, update, deletion) based on unique identifier (ID or Slug).
    return await resolveResourceByIdOrSlug(resourceType, idOrSlug);
  }

  // Handles resolve for contextual resource operations, like fetching or creating child resources
  return await resolveParentContext(resourceType, ctx);
};

/**
* Resolves resource based on ID or Slug and sets the context accordingly.
* @param resourceType - The type of the resource.
* @param idOrSlug - The unique identifier (ID or Slug) of the resource.
* @param ctx - The context object containing request and response details.
*/
async function resolveResourceByIdOrSlug(resourceType: string, idOrSlug: string) {
  const table = tables.get(resourceType);

  // Return early if table is not available
  if (!table) return;

  const [resource] = await db
    .select()
    .from(table)
    .where(or(eq(table.id, idOrSlug), eq(table.slug, idOrSlug)));

  return resource;
}

/**
* Resolves the parent context for contextual resource operations and sets the context accordingly.
* @param resourceType - The type of the resource.
* @param ctx - The context object containing request and response details.
*/

// biome-ignore lint/suspicious/noExplicitAny: Prevent assignable errors
async function resolveParentContext(resourceType: string, ctx: any) {
  const resource = HierarchicalEntity.instanceMap.get(resourceType);

    // Return early if resource is not available
  if (!resource) return;

  // Extract payload from request body
  const payload = ctx.req.valid('json');

  // Iterate over ancestors (from lowest to highest) and determine the lowest ancestor available
  for (const ancestor of resource.descSortedAncestors) {
    // Check if ancestor identifier is provided in params or query
    let lowestAncestorIdOrSlug = ctx.req.param(ancestor.name)?.toLowerCase() || ctx.req.query(ancestor.name)?.toLowerCase();

    // If not found in params or query, check if it's provided in the request body
    if (!lowestAncestorIdOrSlug && payload) {
      lowestAncestorIdOrSlug = payload[ancestor.name];
    }

    // If identifier is found, resolve the resource and set the context
    if (lowestAncestorIdOrSlug) {
      return await resolveResourceByIdOrSlug(ancestor.name, lowestAncestorIdOrSlug);
    }
  }
}

export default protect;