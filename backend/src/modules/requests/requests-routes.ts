import { createXRoute } from '#/core/x-routes';
import { publicGuard, sysAdminGuard, userGuard } from '#/middlewares/guard';
import { isNoBot } from '#/middlewares/is-no-bot';
import { bulkPointsLimiter, spamLimiter } from '#/middlewares/rate-limiter/limiters';
import { requestCreateBodySchema, requestListQuerySchema, requestSchema } from '#/modules/requests/requests-schema';
import { batchResponseSchema, errorResponseRefs, idsBodySchema, paginationSchema } from '#/schemas';
import { mockPaginatedRequestsResponse } from './requests-mocks';

const requestRoutes = {
  createRequest: createXRoute({
    operationId: 'createRequest',
    method: 'post',
    path: '/',
    xGuard: [publicGuard],
    xRateLimiter: [spamLimiter],
    middleware: [isNoBot],
    tags: ['requests', 'cella'],
    summary: 'Create request',
    description:
      'Submits a request: a contact form message, a newsletter signup or a waitlist entry. Every submission gets the same answer: an address that has an account gets an email pointing to sign-in, and a repeat of a waitlist or newsletter signup is dropped.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: requestCreateBodySchema } },
      },
    },
    responses: {
      204: { description: 'Request received' },
      ...errorResponseRefs,
    },
  }),
  getRequests: createXRoute({
    operationId: 'getRequests',
    method: 'get',
    path: '/',
    xGuard: [userGuard, sysAdminGuard],
    tags: ['requests', 'cella'],
    summary: 'Get list of requests',
    description: 'Returns a list of submitted requests across all types: contact form, newsletter, and waitlist.',
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
  deleteRequests: createXRoute({
    operationId: 'deleteRequests',
    method: 'delete',
    path: '/',
    xGuard: [userGuard, sysAdminGuard],
    xRateLimiter: [bulkPointsLimiter],
    tags: ['requests', 'cella'],
    summary: 'Delete requests',
    description: 'Deletes one or more requests from the system by their IDs.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: idsBodySchema() } },
      },
    },
    responses: {
      200: {
        description: 'Success',
        content: { 'application/json': { schema: batchResponseSchema() } },
      },
      ...errorResponseRefs,
    },
  }),
};

export { requestRoutes };
