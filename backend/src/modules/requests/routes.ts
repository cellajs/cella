import { createCustomRoute } from '#/lib/custom-routes';
import { hasSystemAccess, isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { isNoBot } from '#/middlewares/is-no-bot';
import { spamLimiter } from '#/middlewares/rate-limiter/limiters';
import { requestCreateBodySchema, requestListQuerySchema, requestSchema } from '#/modules/requests/schema';
import { idsBodySchema } from '#/utils/schema/common';
import { errorResponses, paginationSchema, successWithoutDataSchema } from '#/utils/schema/responses';

const requestRoutes = {
  createRequest: createCustomRoute({
    operationId: 'createRequest',
    method: 'post',
    path: '/',
    guard: isPublicAccess,
    middleware: [isNoBot, spamLimiter],
    tags: ['requests'],
    summary: 'Create request',
    description: 'Create a request on system level. Request supports waitlist, contact form and newsletter.',
    request: {
      body: {
        content: {
          'application/json': {
            schema: requestCreateBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Requests',
        content: { 'application/json': { schema: requestSchema } },
      },
      ...errorResponses,
    },
  }),
  getRequests: createCustomRoute({
    operationId: 'getRequests',
    method: 'get',
    path: '/',
    guard: [isAuthenticated, hasSystemAccess],
    tags: ['requests'],
    summary: 'Get list of requests',
    description: 'Get list of requests on system level for waitlist, submit contact form or to join newsletter.',
    request: {
      query: requestListQuerySchema,
    },
    responses: {
      200: {
        description: 'Requests',
        content: {
          'application/json': {
            schema: paginationSchema(requestSchema),
          },
        },
      },
      ...errorResponses,
    },
  }),
  deleteRequests: createCustomRoute({
    operationId: 'deleteRequest',
    method: 'delete',
    path: '/',
    guard: [isAuthenticated, hasSystemAccess],
    tags: ['requests'],
    summary: 'Delete requests',
    description: 'Delete requests by ids.',
    request: {
      body: {
        content: { 'application/json': { schema: idsBodySchema() } },
      },
    },
    responses: {
      200: {
        description: 'Requests',
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
      },
      ...errorResponses,
    },
  }),
};
export default requestRoutes;
