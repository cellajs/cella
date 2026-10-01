import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { actorGuard, crossTenantGuard, relatableGuard, tenantGuard, userGuard } from '#/middlewares/guard';
import { insertEntityLock } from '#/middlewares/insert-entity-lock';
import { bulkPointsLimiter, singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import {
  organizationCreateBodySchema,
  organizationListQuerySchema,
  organizationSchema,
  organizationUpdateBodySchema,
  organizationWithMembershipSchema,
} from '#/modules/organization/organization-schema';
import { batchResponseSchema, idsBodySchema, paginationSchema, slugIncludeQuerySchema, tenantIdParamSchema, tenantOnlyParamSchema } from '#/schemas';
import { mockBatchOrganizationsResponse, mockOrganizationResponse, mockPaginatedOrganizationsResponse } from './organization-mocks';

const organizationRoutes = createXRoutes(['organizations', 'cella', 'channel'], {
  createOrganizations: xRoute({
    method: 'post',
    path: '/{tenantId}/organizations',
    xGuard: [userGuard, tenantGuard],
    xRateLimiter: [insertEntityLock, bulkPointsLimiter],
    summary: 'Create organizations',
    description: 'Creates one or more new organizations within a tenant.',
    request: { params: tenantOnlyParamSchema, body: jsonBody(organizationCreateBodySchema) },
    responses: { 201: json('Organizations were created', batchResponseSchema(organizationWithMembershipSchema), mockBatchOrganizationsResponse()) },
  }),
  getOrganizations: xRoute({
    method: 'get',
    path: '/organizations',
    xGuard: [userGuard, crossTenantGuard, relatableGuard],
    summary: 'Get list of organizations',
    description: 'Returns a list of organizations.',
    request: { query: organizationListQuerySchema },
    responses: { 200: json('Organizations', paginationSchema(organizationSchema), mockPaginatedOrganizationsResponse()) },
  }),
  getOrganization: xRoute({
    method: 'get',
    path: '/{tenantId}/organizations/{id}',
    xGuard: [actorGuard, tenantGuard],
    summary: 'Get organization',
    description: 'Retrieves an organization by ID within a tenant. Pass ?slug=true to resolve by slug instead.',
    request: { params: tenantIdParamSchema, query: slugIncludeQuerySchema },
    responses: { 200: json('Organization', organizationSchema, mockOrganizationResponse()) },
  }),
  updateOrganization: xRoute({
    method: 'put',
    path: '/{tenantId}/organizations/{id}',
    xGuard: [actorGuard, tenantGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Update organization',
    description: 'Updates an organization within a tenant.',
    request: { params: tenantIdParamSchema, body: jsonBody(organizationUpdateBodySchema) },
    responses: { 200: json('Organization was updated', organizationSchema, mockOrganizationResponse()) },
  }),
  deleteOrganizations: xRoute({
    method: 'delete',
    path: '/{tenantId}/organizations',
    xGuard: [userGuard, tenantGuard],
    xRateLimiter: [bulkPointsLimiter],
    summary: 'Delete organizations',
    description: 'Deletes one or more organizations by ID within a tenant.',
    request: { params: tenantOnlyParamSchema, body: jsonBody(idsBodySchema()) },
    responses: { 200: json('Success', batchResponseSchema()) },
  }),
});

export { organizationRoutes };
