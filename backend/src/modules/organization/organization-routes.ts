import { createXRoute } from '#/docs/x-routes';
import { isAuthenticated } from '#/middlewares/guard';
import {
  organizationCreateBodySchema,
  organizationListQuerySchema,
  organizationSchema,
  organizationUpdateBodySchema,
  organizationWithMembershipSchema,
} from '#/modules/organization/organization-schema';
import {
  batchResponseSchema,
  entityParamSchema,
  errorResponseRefs,
  idsBodySchema,
  paginationSchema,
  successWithRejectedItemsSchema,
} from '#/schemas';
import {
  mockBatchOrganizationsResponse,
  mockOrganizationResponse,
  mockPaginatedOrganizationsResponse,
} from '../../../mocks/mock-organization';

const organizationRoutes = {
  /**
   * Create one or more organizations
   */
  createOrganizations: createXRoute({
    operationId: 'createOrganizations',
    method: 'post',
    path: '/',
    xGuard: isAuthenticated,
    tags: ['organizations'],
    summary: 'Create organizations',
    description: 'Creates one or more new *organizations*.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: organizationCreateBodySchema } },
      },
    },
    responses: {
      201: {
        description: 'Organizations were created',
        content: {
          'application/json': {
            schema: batchResponseSchema(organizationWithMembershipSchema),
            example: mockBatchOrganizationsResponse(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get list of organizations
   */
  getOrganizations: createXRoute({
    operationId: 'getOrganizations',
    method: 'get',
    path: '/',
    xGuard: [isAuthenticated],
    tags: ['organizations'],
    summary: 'Get list of organizations',
    description: 'Returns a list of *organizations*.',
    request: { query: organizationListQuerySchema },
    responses: {
      200: {
        description: 'Organizations',
        content: {
          'application/json': {
            schema: paginationSchema(organizationSchema),
            example: mockPaginatedOrganizationsResponse(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Update an organization
   */
  updateOrganization: createXRoute({
    operationId: 'updateOrganization',
    method: 'put',
    path: '/{id}',
    xGuard: [isAuthenticated],
    tags: ['organizations'],
    summary: 'Update organization',
    description: 'Updates an *organization*.',
    request: {
      params: entityParamSchema,
      body: {
        content: { 'application/json': { schema: organizationUpdateBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Organization was updated',
        content: { 'application/json': { schema: organizationSchema, example: mockOrganizationResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Get an organization
   */
  getOrganization: createXRoute({
    operationId: 'getOrganization',
    method: 'get',
    path: '/{id}',
    xGuard: [isAuthenticated],
    tags: ['organizations'],
    summary: 'Get organization',
    description: 'Retrieves an *organization* by ID.',
    request: { params: entityParamSchema },
    responses: {
      200: {
        description: 'Organization',
        content: { 'application/json': { schema: organizationSchema, example: mockOrganizationResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Delete organizations
   */
  deleteOrganizations: createXRoute({
    operationId: 'deleteOrganizations',
    method: 'delete',
    path: '/',
    xGuard: [isAuthenticated],
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
