import { createCustomRoute } from '#/lib/custom-routes';
import { hasSystemAccess, isAuthenticated, isPublicAccess } from '#/middlewares/guard';
import { isNoBot } from '#/middlewares/is-no-bot';
import { emailEnumLimiter, spamLimiter } from '#/middlewares/rate-limiter/limiters';
import { requestCreateBodySchema, requestListQuerySchema, requestSchema } from '#/modules/requests/schema';
import { idsBodySchema } from '#/utils/schema/common';
import { errorResponseRefs } from '#/utils/schema/error-responses';
import { paginationSchema } from '#/utils/schema/success-responses';

const requestRoutes = {
  createRequest: createCustomRoute({
    operationId: 'createRequest',
    method: 'post',
    path: '/',
    guard: isPublicAccess,
    middleware: [isNoBot, emailEnumLimiter, spamLimiter],
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
        content: { 'application/json': { schema: requestSchema } },
      },
      ...errorResponseRefs,
    },
  }),
  getRequests: createCustomRoute({
    operationId: 'getRequests',
    method: 'get',
    path: '/',
    guard: [isAuthenticated, hasSystemAccess],
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
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  deleteRequests: createCustomRoute({
    operationId: 'deleteRequests',
    method: 'delete',
    path: '/',
    guard: [isAuthenticated, hasSystemAccess],
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
