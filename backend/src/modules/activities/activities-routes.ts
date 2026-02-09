import { createXRoute } from '#/docs/x-routes';
import { authGuard, sysAdminGuard } from '#/middlewares/guard';
import { activityListQuerySchema, activitySchema } from '#/modules/activities/activities-schema';
import { errorResponseRefs, paginationSchema } from '#/schemas';
import { mockPaginatedActivitiesResponse } from '../../../mocks/mock-activity';

const activityRoutes = {
  /**
   * Get list of activities
   */
  getActivities: createXRoute({
    operationId: 'getActivities',
    method: 'get',
    path: '/',
    xGuard: [authGuard, sysAdminGuard],
    tags: ['activities'],
    summary: 'Get list of activities',
    description:
      'Returns a paginated list of *activities* (audit log entries). Activities track create, update, and delete operations across all resources.',
    request: { query: activityListQuerySchema },
    responses: {
      200: {
        description: 'Activities',
        content: {
          'application/json': {
            schema: paginationSchema(activitySchema),
            example: mockPaginatedActivitiesResponse(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
};

export default activityRoutes;
