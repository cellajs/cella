import {
  errorResponses,
  successResponseWithDataSchema,
  successResponseWithErrorsSchema,
  successResponseWithPaginationSchema,
} from '../../lib/common-responses';
import { deleteByIdsQuerySchema, userParamSchema } from '../../lib/common-schemas';
import { createRouteConfig } from '../../lib/route-config';
import { isAuthenticated, isSystemAdmin } from '../../middlewares/guard';
import { apiUserSchema, getUsersQuerySchema, updateUserJsonSchema, userMenuSchema } from './schema';

export const meRouteConfig = createRouteConfig({
  method: 'get',
  path: '/me',
  guard: isAuthenticated,
  tags: ['users'],
  summary: 'Get self',
  description: 'Get the current user (self).',
  responses: {
    200: {
      description: 'User',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(apiUserSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const getUsersConfig = createRouteConfig({
  method: 'get',
  path: '/users',
  guard: [isAuthenticated, isSystemAdmin],
  tags: ['users'],
  summary: 'Get list of users',
  description: 'Get a list of users on system level.',
  request: {
    query: getUsersQuerySchema,
  },
  responses: {
    200: {
      description: 'Users',
      content: {
        'application/json': {
          schema: successResponseWithPaginationSchema(apiUserSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const updateUserConfig = createRouteConfig({
  method: 'put',
  path: '/users/{user}',
  guard: [isAuthenticated, isSystemAdmin],
  tags: ['users'],
  summary: 'Update user',
  description: 'Update a user by id or slug.',
  request: {
    params: userParamSchema,
    body: {
      content: {
        'application/json': {
          schema: updateUserJsonSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'User',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(apiUserSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const updateSelfConfig = createRouteConfig({
  method: 'put',
  path: '/me',
  guard: isAuthenticated,
  tags: ['users'],
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
          schema: successResponseWithDataSchema(apiUserSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const getUserRouteConfig = createRouteConfig({
  method: 'get',
  path: '/users/{user}',
  guard: isAuthenticated,
  tags: ['users'],
  summary: 'Get user',
  description: 'Get a user by id or slug.',
  request: {
    params: userParamSchema,
  },
  responses: {
    200: {
      description: 'User',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(apiUserSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const getUserMenuConfig = createRouteConfig({
  method: 'get',
  path: '/me/menu',
  guard: isAuthenticated,
  tags: ['users'],
  summary: 'Get menu of self',
  description: 'Receive a menu data with all contextual entities of which the current user is a member.',
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
  path: '/me/sessions',
  guard: isAuthenticated,
  tags: ['users'],
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

export const deleteUsersRouteConfig = createRouteConfig({
  method: 'delete',
  path: '/users',
  guard: [isAuthenticated, isSystemAdmin],
  tags: ['users'],
  summary: 'Delete users',
  description: 'Delete users from system by list of ids.',
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
