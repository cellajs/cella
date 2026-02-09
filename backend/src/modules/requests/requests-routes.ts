import { createXRoute } from '#/docs/x-routes';
import { authGuard, publicGuard, sysAdminGuard } from '#/middlewares/guard';
import { isNoBot } from '#/middlewares/is-no-bot';
import { emailEnumLimiter, spamLimiter } from '#/middlewares/rate-limiter/limiters';
import { requestCreateBodySchema, requestListQuerySchema, requestSchema } from '#/modules/requests/requests-schema';
import { errorResponseRefs, idsBodySchema, paginationSchema } from '#/schemas';
import { mockPaginatedRequestsResponse, mockRequestResponse } from '../../../mocks/mock-request';

const requestRoutes = {
  /**
   * Create request
   */
  createRequest: createXRoute({
    operationId: 'createRequest',
    method: 'post',
    path: '/',
    xGuard: publicGuard,
    xRateLimiter: [emailEnumLimiter, spamLimiter],
    middleware: [isNoBot],
    tags: ['requests'],
    summary: 'Create request',
    description:
      'Submits a new *request* to the system. Supported types include contact form, newsletter signup, and waitlist entry.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: requestCreateBodySchema } },
      },
    },
    responses: {
      201: {
        description: 'Requests',
        content: { 'application/json': { schema: requestSchema, example: mockRequestResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get list of requests
   */
  getRequests: createXRoute({
    operationId: 'getRequests',
    method: 'get',
    path: '/',
    xGuard: [authGuard, sysAdminGuard],
    tags: ['requests'],
    summary: 'Get list of requests',
    description: 'Returns a list of submitted *requests* across all types: contact form, newsletter, and waitlist.',
    request: { query: requestListQuerySchema },
    responses: {
      200: {
        description: 'Requests',
        content: {
          'application/json': {
            schema: paginationSchema(requestSchema),
            example: mockPaginatedRequestsResponse(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Delete requests
   */
  deleteRequests: createXRoute({
    operationId: 'deleteRequests',
    method: 'delete',
    path: '/',
    xGuard: [authGuard, sysAdminGuard],
    tags: ['requests'],
    summary: 'Delete requests',
    description: 'Deletes one or more *requests* from the system by their IDs.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: idsBodySchema() } },
      },
    },
    responses: {
      204: {
        description: 'Requests deleted',
      },
      ...errorResponseRefs,
    },
  }),
};
export default requestRoutes;
