import { errorResponses, successResponseWithDataSchema, successResponseWithErrorsSchema } from '../../lib/common-responses';
import { deleteByIdsQuerySchema } from '../../lib/common-schemas';
import { createRouteConfig } from '../../lib/route-config';
import { isAuthenticated } from '../../middlewares/guard';
import { updateUserJsonSchema } from '../users/schema';
import { meUserSchema, userMenuSchema } from './schema';

export const meRouteConfig = createRouteConfig({
  method: 'get',
  path: '/',
  guard: isAuthenticated,
  tags: ['me'],
  summary: 'Get self',
  description: 'Get the current user (self). It includes a `counts` object and a list of `sessions`.',
  responses: {
    200: {
      description: 'User',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(meUserSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const updateSelfConfig = createRouteConfig({
  method: 'put',
  path: '/',
  guard: isAuthenticated,
  tags: ['me'],
  summary: 'Update self',
  description: 'Update the current user (self).',
  request: {
    body: {
      content: {
        'application/json': {
          schema: updateUserJsonSchema.omit({
            role: true,
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'User',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(meUserSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const getUserMenuConfig = createRouteConfig({
  method: 'get',
  path: '/menu',
  guard: isAuthenticated,
  tags: ['me'],
  summary: 'Get menu of self',
  description: 'Receive menu data with all contextual entities of which the current user is a member. It is in essence a restructured list of `memberships` per entity type, with some entity data in it.',
  responses: {
    200: {
      description: 'Menu of user',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(userMenuSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const terminateSessionsConfig = createRouteConfig({
  method: 'delete',
  path: '/sessions',
  guard: isAuthenticated,
  tags: ['me'],
  summary: 'Terminate sessions',
  description: 'Terminate all sessions of the current user, except for current session.',
  request: {
    query: deleteByIdsQuerySchema,
  },
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: successResponseWithErrorsSchema(),
        },
      },
    },
    ...errorResponses,
  },
});
