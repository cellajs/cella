import { createXRoute } from '#/docs/x-routes';
import { authGuard, crossTenantGuard, relatableGuard, tenantGuard } from '#/middlewares/guard';
import { bulkPointsLimiter } from '#/middlewares/rate-limiter/limiters';
import {
  organizationCreateBodySchema,
  organizationListQuerySchema,
  organizationQuerySchema,
  organizationSchema,
  organizationUpdateBodySchema,
  organizationWithMembershipSchema,
} from '#/modules/organization/organization-schema';
import {
  batchResponseSchema,
  errorResponseRefs,
  idsBodySchema,
  paginationSchema,
  tenantIdParamSchema,
  tenantOnlyParamSchema,
} from '#/schemas';
import {
  mockBatchOrganizationsResponse,
  mockOrganizationResponse,
  mockPaginatedOrganizationsResponse,
} from '../../../mocks/mock-organization';

const organizationRoutes = {
  /**
   * Create one or more organizations within a tenant
   */
  createOrganizations: createXRoute({
    operationId: 'createOrganizations',
    method: 'post',
    path: '/{tenantId}/organizations',
    xGuard: [authGuard, tenantGuard],
    xRateLimiter: bulkPointsLimiter,
    tags: ['organizations'],
    summary: 'Create organizations',
    description: 'Creates one or more new *organizations* within a tenant.',
    request: {
      params: tenantOnlyParamSchema,
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
   * Get list of organizations (cross-tenant)
   */
  getOrganizations: createXRoute({
    operationId: 'getOrganizations',
    method: 'get',
    path: '/organizations',
    xGuard: [authGuard, crossTenantGuard, relatableGuard],
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
   * Get an organization (tenant-scoped)
   */
  getOrganization: createXRoute({
    operationId: 'getOrganization',
    method: 'get',
    path: '/{tenantId}/organizations/{id}',
    xGuard: [authGuard, tenantGuard],
    tags: ['organizations'],
    summary: 'Get organization',
    description: 'Retrieves an *organization* by ID within a tenant. Pass `?slug=true` to resolve by slug instead.',
    request: { params: tenantIdParamSchema, query: organizationQuerySchema },
    responses: {
      200: {
        description: 'Organization',
        content: { 'application/json': { schema: organizationSchema, example: mockOrganizationResponse() } },
      },
      ...errorResponseRefs,
    },
  }),
  /**
   * Update an organization (tenant-scoped)
   */
  updateOrganization: createXRoute({
    operationId: 'updateOrganization',
    method: 'put',
    path: '/{tenantId}/organizations/{id}',
    xGuard: [authGuard, tenantGuard],
    tags: ['organizations'],
    summary: 'Update organization',
    description: 'Updates an *organization* within a tenant.',
    request: {
      params: tenantIdParamSchema,
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
   * Delete organizations (tenant-scoped)
   */
  deleteOrganizations: createXRoute({
    operationId: 'deleteOrganizations',
    method: 'delete',
    path: '/{tenantId}/organizations',
    xGuard: [authGuard, tenantGuard],
    xRateLimiter: bulkPointsLimiter,
    tags: ['organizations'],
    summary: 'Delete organizations',
    description: 'Deletes one or more *organizations* by ID within a tenant.',
    request: {
      params: tenantOnlyParamSchema,
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
            schema: batchResponseSchema(),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
};
export default organizationRoutes;
