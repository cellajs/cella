import {
  errorResponses,
  successResponseWithDataSchema,
  successResponseWithErrorsSchema,
  successResponseWithPaginationSchema,
} from '../../lib/common-responses';
import { deleteByIdsQuerySchema, entityParamSchema } from '../../lib/common-schemas';
import { createRouteConfig } from '../../lib/route-config';
import { isAllowedTo, isAuthenticated, splitByAllowance } from '../../middlewares/guard';

import { apiProjectSchema, createProjectJsonSchema, createProjectQuerySchema, getProjectsQuerySchema, updateProjectJsonSchema } from './schema';

class ProjectRoutesConfig {
  public createProject = createRouteConfig({
    method: 'post',
    path: '/',
    guard: [isAuthenticated, isAllowedTo('create', 'PROJECT')],
    tags: ['projects'],
    summary: 'Create new project',
    description: 'Create a new project in an organization. Creator will become admin and can invite other members.',
    security: [{ bearerAuth: [] }],
    request: {
      query: createProjectQuerySchema,
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

  public getProject = createRouteConfig({
    method: 'get',
    path: '/{idOrSlug}',
    guard: [isAuthenticated, isAllowedTo('read', 'PROJECT')],
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

  public getProjects = createRouteConfig({
    method: 'get',
    path: '/',
    guard: [isAuthenticated, isAllowedTo('read', 'ORGANIZATION')],
    tags: ['projects'],
    summary: 'Get list of projects',
    description: 'Get list of projects in which you have a membership or - if a `requestedUserId` is provided - the projects of this user.',
    request: {
      query: getProjectsQuerySchema,
    },
    responses: {
      200: {
        description: 'Projects',
        content: {
          'application/json': {
            schema: successResponseWithPaginationSchema(apiProjectSchema),
          },
        },
        ...errorResponses,
      },
    },
  });

  public updateProject = createRouteConfig({
    method: 'put',
    path: '/{idOrSlug}',
    guard: [isAuthenticated, isAllowedTo('update', 'PROJECT')],
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

  public deleteProjects = createRouteConfig({
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
}
export default new ProjectRoutesConfig();
