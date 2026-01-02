import { createCustomRoute } from '#/lib/custom-routes';
import { isAuthenticated } from '#/middlewares/guard';
import { checkSlugBodySchema } from '#/modules/entities/schema';
import { errorResponseRefs } from '#/utils/schema/error-responses';

const entityRoutes = {
  /**
   * Check slug availability
   */
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
};
export default entityRoutes;
