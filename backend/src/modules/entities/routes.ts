import { z } from '@hono/zod-openapi';
import { createCustomRoute } from '#/lib/custom-routes';
import { isAuthenticated } from '#/middlewares/guard';
import { contextEntitiesQuerySchema, contextEntitiesResponseSchema } from '#/modules/entities/schema';
import { entityTypeSchema, slugSchema } from '#/utils/schema/common';
import { errorResponses, successWithoutDataSchema } from '#/utils/schema/responses';

const entityRoutes = {
  checkSlug: createCustomRoute({
    operationId: 'checkSlug',
    method: 'post',
    path: '/check-slug',
    guard: isAuthenticated,
    tags: ['entities'],
    summary: 'Check if slug is available',
    description: `Checks whether a given slug is available across all entity types (e.g. *organizations*, *users*).
      Primarily used to prevent slug collisions before creating or updating an entity.`,
    request: {
      body: { content: { 'application/json': { schema: z.object({ slug: slugSchema, entityType: entityTypeSchema }) } } },
    },
    responses: {
      200: {
        description: 'Slug is available',
        content: { 'application/json': { schema: successWithoutDataSchema } },
      },
      ...errorResponses,
    },
  }),
  getContextEntities: createCustomRoute({
    operationId: 'getContextEntities',
    method: 'get',
    path: '/contextEntities',
    guard: isAuthenticated,
    tags: ['entities'],
    summary: 'Get all of list of a context user entities',
    description: `Returns a paginated list of *contextual entities* (e.g. *users*, *organizations*) the current user has access to.
      Can optionally include the current user's enrollment information for each entity (when applicable).
      You can also provide a specific user ID to retrieve the entities that *user* is enrolled in, useful for profile views or access audits.
      The response includes only fields shared across all entity types, such as \`id\`, \`slug\`, and \`name\`.`,
    request: { query: contextEntitiesQuerySchema },
    responses: {
      200: {
        description: 'Context entities',
        content: { 'application/json': { schema: contextEntitiesResponseSchema } },
      },
      ...errorResponses,
    },
  }),
};
export default entityRoutes;
