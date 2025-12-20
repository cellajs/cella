import { createCustomRoute } from '#/lib/custom-routes';
import { isAuthenticated } from '#/middlewares/guard';
import {
  organizationCreateBodySchema,
  organizationListQuerySchema,
  organizationSchema,
  organizationUpdateBodySchema,
  organizationWithMembershipSchema,
} from '#/modules/organizations/schema';
import { entityParamSchema, idsBodySchema } from '#/utils/schema/common';
import { errorResponseRefs } from '#/utils/schema/error-responses';
import { paginationSchema, successWithRejectedItemsSchema } from '#/utils/schema/success-responses';

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
        content: { 'application/json': { schema: organizationCreateBodySchema } },
      },
    },
    responses: {
      201: {
        description: 'Organization was created',
        content: { 'application/json': { schema: organizationWithMembershipSchema } },
      },
      ...errorResponseRefs,
    },
  }),
  getOrganizations: createCustomRoute({
    operationId: 'getOrganizations',
    method: 'get',
    path: '/',
    guard: [isAuthenticated],
    tags: ['organizations'],
    summary: 'Get list of organizations',
    description: 'Returns a list of *organizations*.',
    request: { query: organizationListQuerySchema },
    responses: {
      200: {
        description: 'Organizations',
        content: { 'application/json': { schema: paginationSchema(organizationSchema) } },
      },
      ...errorResponseRefs,
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
        content: { 'application/json': { schema: organizationUpdateBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Organization was updated',
        content: { 'application/json': { schema: organizationSchema } },
      },
      ...errorResponseRefs,
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
    request: { params: entityParamSchema },
    responses: {
      200: {
        description: 'Organization',
        content: { 'application/json': { schema: organizationSchema } },
      },
      ...errorResponseRefs,
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
        required: true,
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
      ...errorResponseRefs,
    },
  }),
};
export default organizationRoutes;
