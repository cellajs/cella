import { errorResponses, successResponseWithDataSchema, successResponseWithErrorsSchema } from '../../lib/common-responses';
import { deleteByIdsQuerySchema, organizationParamSchema, workspaceParamSchema } from '../../lib/common-schemas';
import { createRouteConfig } from '../../lib/route-config';
import { systemGuard, authGuard, protect } from '../../middlewares/guard';

import { apiWorkspacesSchema, createWorkspaceJsonSchema, updateWorkspaceJsonSchema } from './schema';

export const createWorkspaceRouteConfig = createRouteConfig({
  method: 'post',
  path: '/organizations/{organization}/workspaces',
  guard: [authGuard(), protect('workspace', 'create')],
  tags: ['workspaces'],
  summary: 'Create a new workspace',
  description: `
    Permissions:
      - Users with system or organization role 'ADMIN'
  `,
  request: {
    params: organizationParamSchema,
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

export const getWorkspaceByIdOrSlugRouteConfig = createRouteConfig({
  method: 'get',
  path: '/workspaces/{workspace}',
  guard: [authGuard(), protect('workspace', 'read')],
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

export const updateWorkspaceRouteConfig = createRouteConfig({
  method: 'put',
  path: '/workspaces/{workspace}',
  guard: [authGuard(), protect('workspace', 'update')],
  tags: ['workspaces'],
  summary: 'Update workspace',
  description: `
    Permissions:
      - Users with role 'ADMIN'
      - Users, who are members of the workspaces and have role 'ADMIN' in the workspace
  `,
  request: {
    params: workspaceParamSchema,
    body: {
      content: {
        'application/json': {
          schema: updateWorkspaceJsonSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Workspace was updated',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(apiWorkspacesSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const deleteWorkspacesRouteConfig = createRouteConfig({
  method: 'delete',
  path: '/workspaces',
  guard: systemGuard,
  tags: ['workspaces'],
  summary: 'Delete workspaces',
  description: `
    Permissions:
      - Users with role 'ADMIN'
  `,
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
