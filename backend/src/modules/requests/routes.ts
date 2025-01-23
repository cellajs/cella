import { createRouteConfig } from '#/lib/route-config';
import { isAuthenticated, isPublicAccess, systemGuard } from '#/middlewares/guard';
import { isNoBot } from '#/middlewares/is-no-bot';
import { spamLimiter } from '#/middlewares/rate-limiter';
import { errorResponses, successWithDataSchema, successWithPaginationSchema, successWithoutDataSchema } from '#/utils/schema/common-responses';
import { idsQuerySchema } from '#/utils/schema/common-schemas';
import { createRequestSchema, getRequestsQuerySchema, requestMessageBodySchema, requestSchema } from './schema';

class RequestsRoutesConfig {
  public createRequest = createRouteConfig({
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
    guard: [isAuthenticated, systemGuard],
    tags: ['requests'],
    summary: 'Get list of requests',
    description: 'Get list of requests on system level for waitlist, submit contact form or to join newsletter.',
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

  public sendMessage = createRouteConfig({
    method: 'post',
    path: '/send-message',
    guard: [isAuthenticated, systemGuard],
    tags: ['requests'],
    summary: 'Message for pending users',
    description: 'Sends a message to users who have pending requests.',
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: requestMessageBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Message sent',
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
      },
      ...errorResponses,
    },
  });

  public deleteRequests = createRouteConfig({
    method: 'delete',
    path: '/',
    guard: [isAuthenticated, systemGuard],
    tags: ['requests'],
    summary: 'Delete requests',
    description: 'Delete requests by ids.',
    request: {
      query: idsQuerySchema,
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
  });
}
export default new RequestsRoutesConfig();
