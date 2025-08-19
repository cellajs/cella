import { createCustomRoute } from '#/lib/custom-routes';
import { isAuthenticated } from '#/middlewares/guard';
import {
  contextEntitiesQuerySchema,
  contextEntitiesSchema,
  contextEntityBaseSchema,
  pageEntitiesQuerySchema,
  pageEntitiesSchema,
} from '#/modules/entities/schema';
import { entityTypeSchema, idOrSlugSchema, pageEntityTypeSchema, slugSchema } from '#/utils/schema/common';
import { errorResponses, successWithoutDataSchema } from '#/utils/schema/responses';
import { z } from '@hono/zod-openapi';

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
    description: `Returns a paginated list of *entities* (e.g. *users*, *organizations*) the current user has access to.
      Can optionally include the current user's enrollment information for each entity (when applicable).
      You can also provide a specific user ID to retrieve the entities that *user* is enrolled in, useful for profile views or access audits.
      The response includes only fields shared across all entity types, such as \`id\`, \`slug\`, and \`name\`.`,
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
    description: `Returns all *contextual entities* (e.g. *organizations*) the specified user is a member of.  
      Each result includes the user's membership data and a list of other users with administrator roles within the same entity.`,
    request: { query: contextEntitiesQuerySchema },
    responses: {
      200: {
        description: 'Context entities',
        content: { 'application/json': { schema: contextEntitiesSchema } },
      },
      ...errorResponses,
    },
  }),
  getEntity: createCustomRoute({
    operationId: 'getEntity',
    method: 'get',
    path: '/{idOrSlug}',
    guard: isAuthenticated,
    tags: ['entities'],
    summary: '',
    description: '',
    request: { query: z.object({ type: pageEntityTypeSchema }), params: z.object({ idOrSlug: idOrSlugSchema }) },
    responses: {
      200: {
        description: 'Context entities',
        content: {
          'application/json': {
            schema: contextEntityBaseSchema.extend({
              entityType: pageEntityTypeSchema,
            }),
          },
        },
      },
      ...errorResponses,
    },
  }),
};
export default entityRoutes;
