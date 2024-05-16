import type { MiddlewareHandler } from 'hono';
import { HierarchicalEntity } from '../../lib/permission-manager';
import { errorResponse } from '../../lib/errors';
import { eq, or } from 'drizzle-orm';
import { db } from '../../db/db';
import type { Env } from '../../types/common';

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
 * Middleware to set the context based on the resource type.
 * Handles both direct resource operations (retrieval, update, deletion) and contextual operations (fetching child resources).
 * @param resourceType - The type of the resource (e.g., 'organization', 'workspace').
 * @returns MiddlewareHandler to set the context in the request.
 */
const setCtx =
  // biome-ignore lint/suspicious/noExplicitAny: it's required to use `any` here
  (resourceType: string): MiddlewareHandler<Env, any> =>
  async (ctx, next) => {

    // Check if resource is configured; if not, return a 404 response
    if (!HierarchicalEntity.instanceMap.has(resourceType)) {
      return errorResponse(ctx, 404, 'not_found', 'warn', 'UNKNOWN', { resourceType });
    }

    // Handles direct resource operations (retrieval, update, deletion) based on unique identifier (ID or Slug).
    const idOrSlug = ctx.req.param(resourceType)?.toLowerCase() || ctx.req.query(resourceType)?.toLowerCase();
    if (idOrSlug) {
      await resolveResourceByIdOrSlug(resourceType, idOrSlug, ctx);
    }
    // Handles contextual resource operations, like fetching or creating child resources
    else {
      await resolveParentContext(resourceType, ctx);
    }

    await next();
  };

/**
 * Resolves resource based on ID or Slug and sets the context accordingly.
 * @param resourceType - The type of the resource.
 * @param idOrSlug - The unique identifier (ID or Slug) of the resource.
 * @param ctx - The context object containing request and response details.
 */

// biome-ignore lint/suspicious/noExplicitAny: Prevent assignable errors
async  function resolveResourceByIdOrSlug(resourceType: string, idOrSlug: string, ctx: any) {
  const table = tables.get(resourceType);
  
  // Return early if table is not available
  if (!table) return;

  const [resource] = await db
    .select()
    .from(table)
    .where(or(eq(table.id, idOrSlug), eq(table.slug, idOrSlug)));

  if (resource) {
    ctx.set(resourceType, resource);
    ctx.set('context', resource);
  }
}

/**
 * Resolves the parent context for contextual resource operations and sets the context accordingly.
 * @param resourceType - The type of the resource.
 * @param ctx - The context object containing request and response details.
 */

// biome-ignore lint/suspicious/noExplicitAny: Prevent assignable errors
async  function resolveParentContext(resourceType: string, ctx: any) {
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
      await resolveResourceByIdOrSlug(ancestor.name, lowestAncestorIdOrSlug, ctx);
      return; // Stop iteration once the lowest ancestor is found
    }
  }
}

// Exposure
export default setCtx;
