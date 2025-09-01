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
import { errorResponses, paginationSchema, successWithRejectedItemsSchema } from '#/utils/schema/responses';

const organizationRoutes = {
  createOrganization: createCustomRoute({
    operationId: 'createOrganization',
    method: 'post',
    path: '/',
    guard: isAuthenticated,
    tags: ['organizations'],
    summary: 'Create organization',
    description: 'Creates a new *organization*.',
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
        content: { 'application/json': { schema: organizationWithMembershipSchema } },
      },
      ...errorResponses,
    },
  }),
  getOrganizations: createCustomRoute({
    operationId: 'getOrganizations',
    method: 'get',
    path: '/',
    guard: [isAuthenticated, hasSystemAccess],
    tags: ['organizations'],
    summary: 'Get list of organizations',
    description: 'Returns a list of *organizations* at the system level.',
    request: {
      query: organizationListQuerySchema,
    },
    responses: {
      200: {
        description: 'Organizations',
        content: {
          'application/json': {
            schema: paginationSchema(organizationSchema.extend({ counts: fullCountsSchema })),
          },
        },
      },
      ...errorResponses,
    },
  }),
  updateOrganization: createCustomRoute({
    operationId: 'updateOrganization',
    method: 'put',
    path: '/{idOrSlug}',
    guard: [isAuthenticated],
    tags: ['organizations'],
    summary: 'Update organization',
    description: 'Updates an *organization* by ID or slug.',
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
        content: { 'application/json': { schema: organizationSchema } },
      },
      ...errorResponses,
    },
  }),
  getOrganization: createCustomRoute({
    operationId: 'getOrganization',
    method: 'get',
    path: '/{idOrSlug}',
    guard: [isAuthenticated],
    tags: ['organizations'],
    summary: 'Get organization',
    description: 'Retrieves an *organization* by ID or slug.',
    request: {
      params: entityParamSchema,
    },
    responses: {
      200: {
        description: 'Organization',
        content: { 'application/json': { schema: organizationSchema } },
      },
      ...errorResponses,
    },
  }),
  deleteOrganizations: createCustomRoute({
    operationId: 'deleteOrganizations',
    method: 'delete',
    path: '/',
    guard: [isAuthenticated],
    tags: ['organizations'],
    summary: 'Delete organizations',
    description: 'Deletes one or more *organizations* by ID.',
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
            schema: successWithRejectedItemsSchema,
          },
        },
      },
      ...errorResponses,
    },
  }),
};
export default organizationRoutes;
