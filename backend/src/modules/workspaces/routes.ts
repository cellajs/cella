import { z } from 'zod';
import { createRouteConfig } from '#/lib/route-config';
import { isAllowedTo, isAuthenticated, splitByAllowance } from '#/middlewares/guard';
import { errorResponses, successWithDataSchema, successWithErrorsSchema } from '#/utils/schema/common-responses';
import { entityInOrgParamSchema, idOrSlugSchema, idsQuerySchema } from '#/utils/schema/common-schemas';

import { createWorkspaceBodySchema, updateWorkspaceBodySchema, workspaceSchema, workspaceWithProjectSchema } from './schema';

class WorkspaceRoutesConfig {
  public createWorkspace = createRouteConfig({
    method: 'post',
    path: '/',
    guard: [isAuthenticated, isAllowedTo('create', 'workspace')],
    tags: ['workspaces'],
    summary: 'Create new workspace',
    description: 'Create personal workspace to organize projects and tasks.',
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: createWorkspaceBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'workspace was created',
        content: {
          'application/json': {
            schema: successWithDataSchema(workspaceSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public getWorkspace = createRouteConfig({
    method: 'get',
    path: '/{idOrSlug}',
    guard: [isAuthenticated, isAllowedTo('read', 'workspace')],
    tags: ['workspaces'],
    summary: 'Get workspace',
    description: 'Get workspace by id or slug.',
    request: {
      params: entityInOrgParamSchema,
    },
    responses: {
      200: {
        description: 'Workspace',
        content: {
          'application/json': {
            schema: successWithDataSchema(workspaceWithProjectSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public updateWorkspace = createRouteConfig({
    method: 'put',
    path: '/{idOrSlug}',
    guard: [isAuthenticated, isAllowedTo('update', 'workspace')],
    tags: ['workspaces'],
    summary: 'Update workspace',
    description: 'Update workspace by id or slug.',
    request: {
      params: entityInOrgParamSchema,
      body: {
        content: {
          'application/json': {
            schema: updateWorkspaceBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Workspace updated',
        content: {
          'application/json': {
            schema: successWithDataSchema(workspaceSchema),
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
      params: z.object({ orgIdOrSlug: idOrSlugSchema }),
      query: idsQuerySchema,
    },
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: successWithErrorsSchema(),
          },
        },
      },
      ...errorResponses,
    },
  });
}
export default new WorkspaceRoutesConfig();
