import {
  errorResponses,
  successResponseWithDataSchema,
  successResponseWithErrorsSchema,
  successResponseWithPaginationSchema,
} from '../../lib/common-responses';
import { deleteByIdsQuerySchema, entityParamSchema } from '../../lib/common-schemas';
import { createRouteConfig } from '../../lib/route-config';
import { isAllowedTo, isAuthenticated, splitByAllowance } from '../../middlewares/guard';

import { apiProjectListSchema, apiProjectSchema, createProjectJsonSchema, getProjectsQuerySchema, updateProjectJsonSchema } from './schema';

export const createProjectRouteConfig = createRouteConfig({
  method: 'post',
  path: '/',
  guard: [isAuthenticated, isAllowedTo('create', 'project')],
  tags: ['projects'],
  summary: 'Create new project',
  description: 'Create a new project in an organization. Creator will become admin and can invite other members.',
  security: [{ bearerAuth: [] }],
  request: {
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
      description: 'Project',
      content: {
        'application/json': {
          schema: successResponseWithDataSchema(apiProjectSchema),
        },
      },
    },
    ...errorResponses,
  },
});

export const getProjectRouteConfig = createRouteConfig({
  method: 'get',
  path: '/{idOrSlug}',
  guard: [isAuthenticated, isAllowedTo('read', 'project')],
  tags: ['projects'],
  summary: 'Get project',
  description: 'Get project by id or slug.',
  request: {
    params: entityParamSchema,
  },
  responses: {
    200: {
      description: 'Project',
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
  path: '/',
  guard: [isAuthenticated],
  tags: ['projects'],
  summary: 'Get list of projects',
  description: 'Get list of projects in which you have a membership or by requestedId.',
  request: {
    query: getProjectsQuerySchema,
  },
  responses: {
    200: {
      description: 'Projects',
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
  path: '/{idOrSlug}',
  guard: [isAuthenticated, isAllowedTo('update', 'project')],
  tags: ['projects'],
  summary: 'Update project',
  description: 'Update project by id or slug.',
  request: {
    params: entityParamSchema,
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
      description: 'Project updated',
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
  path: '/',
  guard: [isAuthenticated, splitByAllowance('delete', 'project')],
  tags: ['projects'],
  summary: 'Delete projects',
  description: 'Delete projects by ids.',
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
