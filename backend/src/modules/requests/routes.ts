import { errorResponses, successResponseWithDataSchema, successResponseWithPaginationSchema } from '../../lib/common-responses';
import { createRouteConfig } from '../../lib/route-config';
import { isAuthenticated, isPublicAccess, isSystemAdmin } from '../../middlewares/guard';
import { authRateLimiter } from '../../middlewares/rate-limiter';
import { apiRequestSchema, createRequestSchema, getRequestsQuerySchema, requestResponseSchema } from './schema';

export const createRequestConfig = createRouteConfig({
  method: 'post',
  path: '/',
  guard: isPublicAccess,
  middleware: [authRateLimiter],
  tags: ['requests'],
  summary: 'Create request',
  description: 'Create a request on system level. Request supports waitlist, contact form and newsletter.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: createRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Requests',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(requestResponseSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const getRequestsConfig = createRouteConfig({
  method: 'get',
  path: '/',
  guard: [isAuthenticated, isSystemAdmin],
  tags: ['requests'],
  summary: 'Get list of requests',
  description: 'Get list of requests on system level for waitlist, contact form or newsletter.',
  request: {
    query: getRequestsQuerySchema,
  },
  responses: {
    200: {
      description: 'Requests',
      content: {
        'application/json': {
          schema: successResponseWithPaginationSchema(apiRequestSchema),
        },
      },
    },
    ...errorResponses,
  },
});
