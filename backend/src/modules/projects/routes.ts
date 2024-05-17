import {
  errorResponses,
  successResponseWithDataSchema,
  successResponseWithErrorsSchema,
  successResponseWithPaginationSchema,
} from '../../lib/common-responses';
import { deleteByIdsQuerySchema, projectParamSchema, workspaceParamSchema } from '../../lib/common-schemas';
import { createRouteConfig } from '../../lib/route-config';
import { projectTenantGuard, systemGuard, workspaceTenantGuard } from '../../middlewares/guard';

import { apiProjectSchema, createProjectJsonSchema, getProjectsQuerySchema, updateProjectJsonSchema } from './schema';

export const createProjectRouteConfig = createRouteConfig({
  method: 'post',
  path: '/workspaces/{workspace}/projects',
  guard: workspaceTenantGuard('workspace', ['ADMIN']),
  tags: ['projects'],
  summary: 'Create a new project',
  description: `
    Permissions:
      - Users with system or workspace role 'ADMIN'
  `,
  request: {
    params: workspaceParamSchema,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: createProjectJsonSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Project was created',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(apiProjectSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const getProjectByIdOrSlugRouteConfig = createRouteConfig({
  method: 'get',
  path: '/projects/{project}',
  guard: projectTenantGuard('project'),
  tags: ['projects'],
  summary: 'Get project by id or slug',
  description: `
    Permissions:
      - Users with system or workspace role 'ADMIN'
      - Users who are part of the project
  `,
  request: {
    params: projectParamSchema,
  },
  responses: {
    200: {
      description: 'projects',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(apiProjectSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const getProjectsRouteConfig = createRouteConfig({
  method: 'get',
  path: '/projects',
  guard: systemGuard,
  tags: ['projects'],
  summary: 'Get projects',
  description: `
        Permissions:
        - Users with role 'ADMIN'
    `,
  request: {
    query: getProjectsQuerySchema,
  },
  responses: {
    200: {
      description: 'projects',
      content: {
        'application/json': {
          schema: successResponseWithPaginationSchema(apiProjectSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const updateProjectRouteConfig = createRouteConfig({
  method: 'put',
  path: '/projects/{project}',
  guard: projectTenantGuard('project', ['ADMIN']),
  tags: ['projects'],
  summary: 'Update projects',
  description: `
    Permissions:
      - Users with role 'ADMIN'
      - Users, who are members of the projects and have role 'ADMIN' in the workspace
  `,
  request: {
    params: projectParamSchema,
    body: {
      content: {
        'application/json': {
          schema: updateProjectJsonSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Project was updated',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(apiProjectSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const deleteProjectsRouteConfig = createRouteConfig({
  method: 'delete',
  path: '/projects',
  guard: systemGuard,
  tags: ['projects'],
  summary: 'Delete projects',
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
