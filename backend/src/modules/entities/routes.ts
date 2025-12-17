import { createCustomRoute } from '#/lib/custom-routes';
import { isAuthenticated } from '#/middlewares/guard';
import { checkSlugBodySchema, contextEntitiesQuerySchema, contextEntityWithCountsSchema } from '#/modules/entities/schema';
import { errorResponseRefs } from '#/utils/schema/error-responses';
import { paginationSchema } from '#/utils/schema/success-responses';

const entityRoutes = {
  checkSlug: createCustomRoute({
    operationId: 'checkSlug',
    method: 'post',
    path: '/check-slug',
    guard: isAuthenticated,
    tags: ['entities'],
    summary: 'Check slug availability',
    description: `Checks whether a given slug is available across all entity types (e.g. *organizations*, *users*).
      Primarily used to prevent slug collisions before creating or updating an entity.`,
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: checkSlugBodySchema } },
      },
    },
    responses: {
      204: {
        description: 'Slug is available',
      },
      ...errorResponseRefs,
    },
  }),
  getContextEntities: createCustomRoute({
    operationId: 'getContextEntities',
    method: 'get',
    path: '/context-entities',
    guard: isAuthenticated,
    tags: ['entities'],
    summary: 'Get list of context entities',
    description: `Returns a paginated list of *context entities* (e.g. *users*, *organizations*) the current user has access to.
      Can optionally include the current user's enrollment information for each entity (when applicable).
      You can also provide a specific user ID to retrieve the entities that *user* is enrolled in, useful for profile views or access audits.
      The response includes only fields shared across all entity types, such as \`id\`, \`slug\`, and \`name\`.`,
    request: { query: contextEntitiesQuerySchema },
    responses: {
      200: {
        description: 'Context entities',
        content: { 'application/json': { schema: paginationSchema(contextEntityWithCountsSchema) } },
      },
      ...errorResponseRefs,
    },
  }),
};
export default entityRoutes;
