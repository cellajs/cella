import {
  errorResponses,
  successResponseWithDataSchema,
  successResponseWithErrorsSchema,
  successResponseWithPaginationSchema,
} from '../../lib/common-responses';
import { deleteByIdsQuerySchema, projectParamSchema, organizationParamSchema } from '../../lib/common-schemas';
import { createRouteConfig } from '../../lib/route-config';
import { isAllowedTo, isAuthenticated, isSystemAdmin } from '../../middlewares/guard';
import { apiUserSchema } from '../users/schema';

import {
  apiProjectSchema,
  apiProjectListSchema,
  createProjectJsonSchema,
  getProjectsQuerySchema,
  getUsersByProjectQuerySchema,
  updateProjectJsonSchema,
  getUserProjectsParamSchema,
  apiUserProjectSchema,
} from './schema';

export const createProjectRouteConfig = createRouteConfig({
  method: 'post',
  path: '/organizations/{organization}/projects',
  guard: [isAuthenticated, isAllowedTo('create', 'project')],
  tags: ['projects'],
  summary: 'Create a new project',
  description: `
    Permissions:
      - Users with system or organization role 'MEMBER'
  `,
  request: {
    params: organizationParamSchema,
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
  guard: [isAuthenticated, isAllowedTo('read', 'project')],
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

export const getUserProjectsRouteConfig = createRouteConfig({
  method: 'get',
  path: '/projects/by-user/{userId}',
  guard: [isAuthenticated, isSystemAdmin],
  tags: ['projects'],
  summary: 'Get user project by memberships',
  description: `
    Permissions:
      - Users role 'ADMIN'
  `,
  request: {
    params: getUserProjectsParamSchema,
  },
  responses: {
    200: {
      description: 'User project',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(apiUserProjectSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const getProjectsRouteConfig = createRouteConfig({
  method: 'get',
  path: '/projects',
  guard: [isAuthenticated, isAllowedTo('read', 'project')],
  tags: ['projects'],
  summary: 'Get list of projects',
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
          schema: successResponseWithPaginationSchema(apiProjectListSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const updateProjectRouteConfig = createRouteConfig({
  method: 'put',
  path: '/projects/{project}',
  guard: [isAuthenticated, isAllowedTo('update', 'project')],
  tags: ['projects'],
  summary: 'Update project',
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
  guard: [isAuthenticated, isAllowedTo('delete', 'project')],
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

export const getUsersByProjectIdRouteConfig = createRouteConfig({
  method: 'get',
  path: '/projects/{project}/members',
  guard: [isAuthenticated, isAllowedTo('read', 'project')],
  tags: ['projects'],
  summary: 'Get members of project',
  description: `
    Permissions:
      - Users with role 'ADMIN'
      - Users, who are members of the project
  `,
  request: {
    params: projectParamSchema,
    query: getUsersByProjectQuerySchema,
  },
  responses: {
    200: {
      description: 'Members of project',
      content: {
        'application/json': {
          schema: successResponseWithPaginationSchema(apiUserSchema),
        },
      },
    },
    ...errorResponses,
  },
});
