import { createXRoute } from '#/docs/x-routes';
import { isAuthenticated } from '#/middlewares/guard';
import { checkSlugBodySchema } from '#/modules/entities/entities-schema';
import { errorResponseRefs } from '#/schemas';

const entityRoutes = {
  /**
   * Check slug availability
   */
  checkSlug: createXRoute({
    operationId: 'checkSlug',
    method: 'post',
    path: '/check-slug',
    xGuard: isAuthenticated,
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
