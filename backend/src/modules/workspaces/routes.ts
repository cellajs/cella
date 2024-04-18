import { errorResponses, successResponseWithDataSchema, successResponseWithPaginationSchema } from '../../lib/common-responses';
import { workspaceParamSchema } from '../../lib/common-schemas';
import { createRouteConfig } from '../../lib/route-config';
import { authGuard, systemGuard } from '../../middlewares/guard';
import tenant from '../../middlewares/guard/tenant';

import {
  apiWorkspaceUserSchema,
  apiWorkspacesSchema,
  createWorkspaceJsonSchema,
  getUsersByProjectQuerySchema,
  getWorkspacesQuerySchema,
} from './schema';

export const createWorkspaceRouteConfig = createRouteConfig({
  method: 'post',
  path: '/workspaces',
  guard: authGuard(),
  tags: ['workspaces'],
  summary: 'Create a new workspace',
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: createWorkspaceJsonSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'workspace was created',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(apiWorkspacesSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const getWorkspacesRouteConfig = createRouteConfig({
  method: 'get',
  path: '/workspaces',
  guard: systemGuard,
  tags: ['workspaces'],
  summary: 'Get list of workspaces',
  description: `
    System role 'ADMIN' receives all workspaces.
    System role 'USER' receives only workspaces with membership.
    Organization role 'ADMIN' receives all workspaces.
    Organization role 'USER' receives only workspaces with membership.
  `,
  request: {
    query: getWorkspacesQuerySchema,
  },
  responses: {
    200: {
      description: 'Organizations',
      content: {
        'application/json': {
          schema: successResponseWithPaginationSchema(apiWorkspacesSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const getWorkspaceByIdOrSlugRouteConfig = createRouteConfig({
  method: 'get',
  path: '/workspaces/{idOrSlug}',
  guard: tenant(),
  tags: ['workspaces'],
  summary: 'Get workspace by id or slug',
  description: `
    Permissions:
      - Users with system or organization role 'ADMIN'
      - Users who are part of the workspace
  `,
  request: {
    params: workspaceParamSchema,
  },
  responses: {
    200: {
      description: 'workspace',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(apiWorkspacesSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const getUsersByWorkspaceIdRouteConfig = createRouteConfig({
  method: 'get',
  path: '/workspaces/{idOrSlug}/members',
  guard: tenant(),
  tags: ['workspaces'],
  summary: 'Get members of workspace',
  description: `
    Permissions:
      - Users with role 'ADMIN'
      - Users who are part of the workspace
  `,
  request: {
    params: workspaceParamSchema,
    query: getUsersByProjectQuerySchema,
  },
  responses: {
    200: {
      description: 'Members of workspace',
      content: {
        'application/json': {
          schema: successResponseWithPaginationSchema(apiWorkspaceUserSchema),
        },
      },
    },
    ...errorResponses,
  },
});
