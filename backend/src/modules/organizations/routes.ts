import { createCustomRoute } from '#/lib/custom-routes';
import { hasSystemAccess, isAuthenticated } from '#/middlewares/guard';
import {
  fullCountsSchema,
  organizationCreateBodySchema,
  organizationListQuerySchema,
  organizationSchema,
  organizationUpdateBodySchema,
  organizationWithMembershipSchema,
} from '#/modules/organizations/schema';
import { entityParamSchema, idsBodySchema } from '#/utils/schema/common';
import { errorResponses, successWithDataSchema, successWithErrorsSchema, successWithPaginationSchema } from '#/utils/schema/responses';

class OrganizationRoutes {
  public createOrganization = createCustomRoute({
    method: 'post',
    path: '/',
    guard: isAuthenticated,
    tags: ['organizations'],
    summary: 'Create organization',
    description: 'Create a new organization.',
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: organizationCreateBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Organization was created',
        content: {
          'application/json': {
            schema: successWithDataSchema(organizationWithMembershipSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public getOrganizations = createCustomRoute({
    method: 'get',
    path: '/',
    guard: [isAuthenticated, hasSystemAccess],
    tags: ['organizations'],
    summary: 'Get list of organizations',
    description: 'Get list of organizations. Currently only available to system admins.',
    request: {
      query: organizationListQuerySchema,
    },
    responses: {
      200: {
        description: 'Organizations',
        content: {
          'application/json': {
            schema: successWithPaginationSchema(organizationSchema.extend({ counts: fullCountsSchema })),
          },
        },
      },
      ...errorResponses,
    },
  });

  public updateOrganization = createCustomRoute({
    method: 'put',
    path: '/{idOrSlug}',
    guard: [isAuthenticated],
    tags: ['organizations'],
    summary: 'Update organization',
    description: 'Update organization by id or slug.',
    request: {
      params: entityParamSchema,
      body: {
        content: {
          'application/json': {
            schema: organizationUpdateBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Organization was updated',
        content: {
          'application/json': {
            schema: successWithDataSchema(organizationSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public getOrganization = createCustomRoute({
    method: 'get',
    path: '/{idOrSlug}',
    guard: [isAuthenticated],
    tags: ['organizations'],
    summary: 'Get organization',
    description: 'Get an organization by id or slug.',
    request: {
      params: entityParamSchema,
    },
    responses: {
      200: {
        description: 'Organization',
        content: {
          'application/json': {
            schema: successWithDataSchema(organizationSchema.extend({ counts: fullCountsSchema })),
          },
        },
      },
      ...errorResponses,
    },
  });

  public deleteOrganizations = createCustomRoute({
    method: 'delete',
    path: '/',
    guard: [isAuthenticated],
    tags: ['organizations'],
    summary: 'Delete organizations',
    description: 'Delete organizations by ids.',
    request: {
      body: {
        content: { 'application/json': { schema: idsBodySchema() } },
      },
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
export default new OrganizationRoutes();
