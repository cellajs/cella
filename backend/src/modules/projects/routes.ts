import { z } from 'zod';
import { createRouteConfig } from '#/lib/route-config';
import { hasOrgAccess, isAuthenticated } from '#/middlewares/guard';
import { errorResponses, successWithDataSchema, successWithErrorsSchema, successWithPaginationSchema } from '#/utils/schema/common-responses';
import { entityInOrgParamSchema, idOrSlugSchema, idsQuerySchema } from '#/utils/schema/common-schemas';

import { membershipInfoSchema } from '../memberships/schema';
import { createProjectBodySchema, createProjectQuerySchema, getProjectsQuerySchema, projectSchema, updateProjectBodySchema } from './schema';

class ProjectRoutesConfig {
  public createProject = createRouteConfig({
    method: 'post',
    path: '/',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['projects'],
    summary: 'Create new project',
    description: 'Create a new project in an organization. Creator will become admin and can invite other members.',
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({ orgIdOrSlug: idOrSlugSchema }),
      query: createProjectQuerySchema,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: createProjectBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Project',
        content: {
          'application/json': {
            schema: successWithDataSchema(projectSchema.extend({ membership: membershipInfoSchema })),
          },
        },
      },
      ...errorResponses,
    },
  });

  public getProject = createRouteConfig({
    method: 'get',
    path: '/{idOrSlug}',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['projects'],
    summary: 'Get project',
    description: 'Get project by id or slug.',
    request: {
      params: entityInOrgParamSchema,
    },
    responses: {
      200: {
        description: 'Project',
        content: {
          'application/json': {
            schema: successWithDataSchema(projectSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public getProjects = createRouteConfig({
    method: 'get',
    path: '/',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['projects'],
    summary: 'Get list of projects',
    description: 'Get list of projects.',
    request: {
      params: z.object({ orgIdOrSlug: idOrSlugSchema }),
      query: getProjectsQuerySchema,
    },
    responses: {
      200: {
        description: 'Projects',
        content: {
          'application/json': {
            schema: successWithPaginationSchema(projectSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public updateProject = createRouteConfig({
    method: 'put',
    path: '/{idOrSlug}',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['projects'],
    summary: 'Update project',
    description: 'Update project by id or slug.',
    request: {
      params: entityInOrgParamSchema,
      body: {
        content: {
          'application/json': {
            schema: updateProjectBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Project updated',
        content: {
          'application/json': {
            schema: successWithDataSchema(projectSchema.extend({ membership: membershipInfoSchema })),
          },
        },
      },
      ...errorResponses,
    },
  });

  public deleteProjects = createRouteConfig({
    method: 'delete',
    path: '/',
    guard: [isAuthenticated, hasOrgAccess],
    tags: ['projects'],
    summary: 'Delete projects',
    description: 'Delete projects by ids.',
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
export default new ProjectRoutesConfig();
