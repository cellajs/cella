import { errorResponses, successResponseWithDataSchema, successResponseWithErrorsSchema } from '../../lib/common-responses';
import { deleteByIdsQuerySchema, entityParamSchema } from '../../lib/common-schemas';
import { createRouteConfig } from '../../lib/route-config';
import { isAllowedTo, isAuthenticated, splitByAllowance } from '../../middlewares/guard';

import { apiWorkspaceSchema, createWorkspaceJsonSchema, updateWorkspaceJsonSchema } from './schema';

class WorkspaceRoutesConfig {
  public createWorkspace = createRouteConfig({
    method: 'post',
    path: '/',
    guard: [isAuthenticated, isAllowedTo('create', 'WORKSPACE')],
    tags: ['workspaces'],
    summary: 'Create new workspace',
    description: 'Create personal workspace to organize projects and tasks.',
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
            schema: successResponseWithDataSchema(apiWorkspaceSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public getWorkspace = createRouteConfig({
    method: 'get',
    path: '/{idOrSlug}',
    guard: [isAuthenticated, isAllowedTo('read', 'WORKSPACE')],
    tags: ['workspaces'],
    summary: 'Get workspace',
    description: 'Get workspace by id or slug.',
    request: {
      params: entityParamSchema,
    },
    responses: {
      200: {
        description: 'Workspace',
        content: {
          'application/json': {
            schema: successResponseWithDataSchema(apiWorkspaceSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public updateWorkspace = createRouteConfig({
    method: 'put',
    path: '/{idOrSlug}',
    guard: [isAuthenticated, isAllowedTo('update', 'WORKSPACE')],
    tags: ['workspaces'],
    summary: 'Update workspace',
    description: 'Update workspace by id or slug.',
    request: {
      params: entityParamSchema,
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
        description: 'Workspace updated',
        content: {
          'application/json': {
            schema: successResponseWithDataSchema(apiWorkspaceSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public deleteWorkspaces = createRouteConfig({
    method: 'delete',
    path: '/',
    guard: [isAuthenticated, splitByAllowance('delete', 'workspace')],
    tags: ['workspaces'],
    summary: 'Delete workspaces',
    description: 'Delete workspaces by ids.',
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
}
export default new WorkspaceRoutesConfig();
