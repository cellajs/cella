import { eq, or } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { db } from '../../db/db';
import { membershipsTable } from '../../db/schema/memberships';
import { errorResponse } from '../../lib/errors';
import permissionManager, { HierarchicalEntity } from '../../lib/permission-manager';
import type { Env } from '../../types/common';
import { logEvent } from '../logger/log-event';

// TODO: Refactor to make schema imports more abstract and modular,
//       so all different schemas don't need to be individually imported/declared.
import { organizationsTable } from '../../db/schema/organizations';
import { projectsTable } from '../../db/schema/projects';
import { workspacesTable } from '../../db/schema/workspaces';

// Create a map to store tables for different resource types
export const tables = new Map<string, typeof organizationsTable | typeof workspacesTable | typeof projectsTable>([
  ['organization', organizationsTable],
  ['workspace', workspacesTable],
  ['project', projectsTable],
]);

/**
 * Middleware to protect routes by checking user permissions.
 * @param action - The action to be performed (e.g., 'read', 'write').
 * @param resourceType - The type of the resource (e.g., 'organization', 'workspace').
 * @returns MiddlewareHandler to protect routes based on user permissions.
 */
const isAllowedTo =
  // biome-ignore lint/suspicious/noExplicitAny: it's required to use `any` here
    (action: string, resourceType: string): MiddlewareHandler<Env, any> =>
    async (ctx: Context, next) => {
      // Extract user
      const user = ctx.get('user');

      // Retrieve the context of the resource to be authorized (e.g., 'organization', 'workspace')
      const context = await getResourceContext(ctx, resourceType);

      // Check if user or context is missing
      if (!context || !user) {
        return errorResponse(ctx, 404, 'not_found', 'warn', 'UNKNOWN', { user: user?.id, id: context?.id || '' });
      }

      // Fetch user's memberships from the database
      const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, user.id));

      // Check if the user is allowed to perform the action in the given context
      const isAllowed = permissionManager.isPermissionAllowed(memberships, action, context);

      // If user is not allowed and not an admin, return a forbidden error
      if (!isAllowed && user.role !== 'ADMIN') {
        return errorResponse(ctx, 403, 'forbidden', 'warn', undefined, { user: user.id, id: context.id });
      }

      // Store the user memberships and authorized resource context in the context
      ctx.set('memberships', memberships);
      ctx.set(resourceType, context);

      // Log user allowance in the context
      logEvent(`User is allowed to ${action} ${context.entity}`, { user: user.id, id: context.id });

      await next();
    };

/**
 * Get the context based on the resource type.
 * Handles resolve for both direct resource operations (retrieval, update, deletion) and contextual operations (fetching child resources).
 * @param ctx - The context object containing request and response details.
 * @param resourceType - The type of the resource (e.g., 'organization', 'workspace').
 */

// biome-ignore lint/suspicious/noExplicitAny: Prevent assignable errors
async function getResourceContext(ctx: any, resourceType: string) {
  // Check if resource is configured; if not, return early
  if (!HierarchicalEntity.instanceMap.has(resourceType)) {
    return;
  }

  const idOrSlug = ctx.req.param(resourceType)?.toLowerCase() || ctx.req.query(resourceType)?.toLowerCase();
  if (idOrSlug) {
    // Handles resolve for direct resource operations (retrieval, update, deletion) based on unique identifier (ID or Slug).
    return await resolveResourceByIdOrSlug(resourceType, idOrSlug);
  }

  // Generate a context using the lowest parent for resource operations, such as fetching or creating child resources
  return await createResourceContext(resourceType, ctx);
}

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
 * Creates a context based on the lowest parent for a resource.
 * @param resourceType - The type of the resource.
 * @param ctx - The context object containing request and response details.
 */

// biome-ignore lint/suspicious/noExplicitAny: Prevent assignable errors
async function createResourceContext(resourceType: string, ctx: any) {
  const resource = HierarchicalEntity.instanceMap.get(resourceType);

  // Return early if resource is not available
  if (!resource) return;

  // Extract payload from request body
  const payload = ctx.req.valid('json');

  // Initialize context to store the custom created resource context based on the lowest possible ancestor
  const context: Record<string, string> = { entity: resourceType.toUpperCase() };

  // Variable to hold the lowest ancestor found
  // biome-ignore lint/suspicious/noExplicitAny: The lowest ancestor can be of different entity types (e.g., organization, workspace, project) or undefined
  let lowestAncestor: any;

  // Iterate over ancestors (from lowest to highest) and determine the lowest ancestor available
  for (const ancestor of resource.descSortedAncestors) {
    // Continue searching for the lowest ancestor if not found yet
    if (!lowestAncestor) {
      // Check if ancestor identifier is provided in params or query
      let lowestAncestorIdOrSlug = ctx.req.param(ancestor.name)?.toLowerCase() || ctx.req.query(ancestor.name)?.toLowerCase();

      // If not found in params or query, check if it's provided in the request body
      if (!lowestAncestorIdOrSlug && payload) {
        lowestAncestorIdOrSlug = payload[ancestor.name];
      }

      // If identifier is found, resolve the lowest ancestor
      if (lowestAncestorIdOrSlug) {
        lowestAncestor = await resolveResourceByIdOrSlug(ancestor.name, lowestAncestorIdOrSlug);
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
