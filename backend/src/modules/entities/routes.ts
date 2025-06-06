import { z } from '@hono/zod-openapi';
import { createCustomRoute } from '#/lib/custom-routes';
import { isAuthenticated } from '#/middlewares/guard';
import { slugSchema } from '#/utils/schema/common';
import { errorResponses, successWithDataSchema, successWithoutDataSchema } from '#/utils/schema/responses';
import { contextEntitiesQuerySchema, contextEntitiesSchema, pageEntitiesQuerySchema, pageEntitiesSchema } from './schema';

class EntityRoutes {
  public checkSlug = createCustomRoute({
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
  });

  public getPageEntities = createCustomRoute({
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
        content: { 'application/json': { schema: successWithDataSchema(pageEntitiesSchema) } },
      },
      ...errorResponses,
    },
  });

  public geContextEntities = createCustomRoute({
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
        content: { 'application/json': { schema: successWithDataSchema(contextEntitiesSchema) } },
      },
      ...errorResponses,
    },
  });
}
export default new EntityRoutes();
