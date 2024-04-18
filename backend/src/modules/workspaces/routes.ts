import { errorResponses, successResponseWithDataSchema } from '../../lib/common-responses';
import { organizationParamSchema, workspaceParamSchema } from '../../lib/common-schemas';
import { createRouteConfig } from '../../lib/route-config';
import { tenantGuard } from '../../middlewares/guard';
import tenant from '../../middlewares/guard/tenant';

import { apiWorkspacesSchema, createWorkspaceJsonSchema } from './schema';

export const createWorkspaceRouteConfig = createRouteConfig({
  method: 'post',
  path: '/workspaces',
  guard: tenantGuard(['ADMIN']),
  tags: ['workspaces'],
  summary: 'Create a new workspace',
  request: {
    request: {
      params: organizationParamSchema,
    },
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
