import { z } from '@hono/zod-openapi';
import { createCustomRoute } from '#/lib/custom-routes';
import { isAuthenticated } from '#/middlewares/guard';
import { contextEntitiesQuerySchema, contextEntitiesSchema, pageEntitiesQuerySchema, pageEntitiesSchema } from '#/modules/entities/schema';
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
    description:
      'Checks whether a given slug is available across all entities (e.g. *organizations*, *users*). Useful for creating or updating *entities*.',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              slug: slugSchema,
              entityType: entityTypeSchema,
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Slug is available',
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
      },
      ...errorResponses,
    },
  }),
  getPageEntities: createCustomRoute({
    operationId: 'getPageEntities',
    method: 'get',
    path: '/page',
    guard: isAuthenticated,
    tags: ['entities'],
    summary: 'Get list of page entities',
    description:
      'Returns a paginated list of *entities* (e.g. *users*, *organizations*) the current user has access to. The response includes only fields common to all entities.',
    request: { query: pageEntitiesQuerySchema },
    responses: {
      200: {
        description: 'Page entities',
        content: { 'application/json': { schema: pageEntitiesSchema } },
      },
      ...errorResponses,
    },
  }),
  getEntitiesWithAdmins: createCustomRoute({
    operationId: 'getEntitiesWithAdmins',
    method: 'get',
    path: '/context',
    guard: isAuthenticated,
    tags: ['entities'],
    summary: 'Get all of context user entities',
    description:
      'Returns all contextual *entities* (e.g. *organizations*) the specified user is a member of, including their membership data and, optionally, other members of each entity.',
    request: { query: contextEntitiesQuerySchema },
    responses: {
      200: {
        description: 'Context entities',
        content: { 'application/json': { schema: contextEntitiesSchema } },
      },
      ...errorResponses,
    },
  }),
};
export default entityRoutes;
