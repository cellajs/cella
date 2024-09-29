import { createRouteConfig } from '#/lib/route-config';
import { isAuthenticated, isPublicAccess, isSystemAdmin } from '#/middlewares/guard';
import { isNoBot } from '#/middlewares/is-no-bot';
import { authRateLimiter } from '#/middlewares/rate-limiter';
import { errorResponses, successWithDataSchema, successWithPaginationSchema } from '#/utils/schema/common-responses';
import { createRequestSchema, getRequestsQuerySchema, requestSchema } from './schema';

class RequestsRoutesConfig {
  public createRequest = createRouteConfig({
    method: 'post',
    path: '/',
    guard: isPublicAccess,
    middleware: [isNoBot, authRateLimiter],
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
            schema: successWithDataSchema(requestSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public getRequests = createRouteConfig({
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
            schema: successWithPaginationSchema(requestSchema),
          },
        },
      },
      ...errorResponses,
    },
  });
}
export default new RequestsRoutesConfig();
