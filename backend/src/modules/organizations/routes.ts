import { createRouteConfig } from '#/lib/route-config';
import { isAuthenticated, systemGuard } from '#/middlewares/guard';
import {
  errorResponses,
  successWithDataSchema,
  successWithErrorsSchema,
  successWithPaginationSchema,
  successWithoutDataSchema,
} from '#/utils/schema/common-responses';
import { entityParamSchema, idsQuerySchema } from '#/utils/schema/common-schemas';
import { membershipInfoSchema } from '../memberships/schema';
import {
  createOrganizationBodySchema,
  getOrganizationsQuerySchema,
  organizationSchema,
  sendNewsletterBodySchema,
  updateOrganizationBodySchema,
} from './schema';

class OrganizationRoutesConfig {
  public createOrganization = createRouteConfig({
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
            schema: createOrganizationBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Organization was createRouteConfigd',
        content: {
          'application/json': {
            schema: successWithDataSchema(organizationSchema.extend({ membership: membershipInfoSchema })),
          },
        },
      },
      ...errorResponses,
    },
  });

  public getOrganizations = createRouteConfig({
    method: 'get',
    path: '/',
    guard: [isAuthenticated, systemGuard],
    tags: ['organizations'],
    summary: 'Get list of organizations',
    description: 'Get list of organizations. Currently only available to system admins.',
    request: {
      query: getOrganizationsQuerySchema,
    },
    responses: {
      200: {
        description: 'Organizations',
        content: {
          'application/json': {
            schema: successWithPaginationSchema(organizationSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public updateOrganization = createRouteConfig({
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
            schema: updateOrganizationBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Organization was updated',
        content: {
          'application/json': {
            schema: successWithDataSchema(organizationSchema.extend({ membership: membershipInfoSchema })),
          },
        },
      },
      ...errorResponses,
    },
  });

  public getOrganization = createRouteConfig({
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
            schema: successWithDataSchema(organizationSchema),
          },
        },
      },
      ...errorResponses,
    },
  });

  public sendNewsletterEmail = createRouteConfig({
    method: 'post',
    path: '/send-newsletter',
    guard: [isAuthenticated, systemGuard],
    tags: ['organizations'],
    summary: 'Newsletter for members',
    description: 'Sends to requested organizations members, a newsletter.',
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: sendNewsletterBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Organization',
        content: {
          'application/json': {
            schema: successWithoutDataSchema,
          },
        },
      },
      ...errorResponses,
    },
  });

  public deleteOrganizations = createRouteConfig({
    method: 'delete',
    path: '/',
    guard: [isAuthenticated],
    tags: ['organizations'],
    summary: 'Delete organizations',
    description: 'Delete organizations by ids.',
    request: {
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
export default new OrganizationRoutesConfig();
