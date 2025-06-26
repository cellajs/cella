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
    description: 'This endpoint is used to check if a slug is available among ALL contextual entities such as organizations.',
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
      'Get page entities such as users and organizations. It returns a paginated list of entities to which the user has access. The schema is limited to common fields.',
    request: { query: pageEntitiesQuerySchema },
    responses: {
      200: {
        description: 'Page entities',
        content: { 'application/json': { schema: pageEntitiesSchema } },
      },
      ...errorResponses,
    },
  }),
  getContextEntities: createCustomRoute({
    operationId: 'getContextEntities',
    method: 'get',
    path: '/context',
    guard: isAuthenticated,
    tags: ['entities'],
    summary: 'Get all of context user entities',
    description:
      'Get context entities such organizations of specified user. It returns list of entities based of requested tpye to which the user are part of. With user membership & other members of entity.',
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
