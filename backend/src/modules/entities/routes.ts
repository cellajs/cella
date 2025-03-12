import { z } from '@hono/zod-openapi';
import { createRouteConfig } from '#/lib/route-config';
import { isAuthenticated } from '#/middlewares/guard';
import { slugSchema } from '#/utils/schema/common';
import { errorResponses, successWithDataSchema, successWithoutDataSchema } from '#/utils/schema/responses';
import { entitiesQuerySchema, entitiesSchema } from './schema';

class EntitiesRouteConfig {
  public checkSlug = createRouteConfig({
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

  public getEntities = createRouteConfig({
    method: 'get',
    path: '/',
    guard: isAuthenticated,
    tags: ['entities'],
    summary: 'Get list of entities',
    description: 'Get page entities such as users and organizations. It returns a limited schema of entities to which the user has access.',
    request: { query: entitiesQuerySchema },
    responses: {
      200: {
        description: 'Entities',
        content: {
          'application/json': {
            schema: successWithDataSchema(entitiesSchema),
          },
        },
      },
      ...errorResponses,
    },
  });
}
export default new EntitiesRouteConfig();
