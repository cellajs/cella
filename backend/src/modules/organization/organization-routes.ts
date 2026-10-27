import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { actorGuard, relatableGuard, tenantGuard, userGuard } from '#/middlewares/guard';
import { insertEntityLock } from '#/middlewares/insert-entity-lock';
import { bulkPointsLimiter, singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import {
  mockBatchOrganizationsResponse,
  mockOrganizationPublishResponse,
  mockPaginatedOrganizationsResponse,
  mockUpdateOrganizationBody,
} from '#/modules/organization/organization-mocks';
import {
  organizationCreateBodySchema,
  organizationListQuerySchema,
  organizationPublishResponseSchema,
  organizationSchema,
  organizationUpdateBodySchema,
  organizationWithMembershipSchema,
} from '#/modules/organization/organization-schema';
import { batchResponseSchema, idsBodySchema, paginationSchema, slugIncludeQuerySchema, tenantIdParamSchema, tenantOnlyParamSchema } from '#/schemas';

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
    xGuard: [userGuard, relatableGuard],
    summary: 'Get list of organizations',
    description: 'Returns a list of organizations.',
    request: { query: organizationListQuerySchema },
    responses: { 200: json('Organizations', paginationSchema(organizationSchema), mockPaginatedOrganizationsResponse()) },
  }),
  getOrganization: xRoute({
    method: 'get',
    path: '/{tenantId}/organizations/{id}',
    xGuard: [actorGuard, tenantGuard],
    xScope: 'organization:read',
    summary: 'Get organization',
    description: 'Retrieves an organization by ID within a tenant. Pass ?slug=true to resolve by slug instead.',
    request: { params: tenantIdParamSchema, query: slugIncludeQuerySchema },
    responses: { 200: json('Organization', organizationSchema) },
  }),
  updateOrganization: xRoute({
    method: 'put',
    path: '/{tenantId}/organizations/{id}',
    xGuard: [actorGuard, tenantGuard],
    xScope: 'organization:write',
    xRateLimiter: [singlePointsLimiter],
    summary: 'Update organization',
    description: 'Updates an organization within a tenant.',
    request: { params: tenantIdParamSchema, body: jsonBody(organizationUpdateBodySchema, mockUpdateOrganizationBody()) },
    responses: { 200: json('Organization was updated', organizationSchema) },
  }),
  publishOrganization: xRoute({
    method: 'put',
    path: '/{tenantId}/organizations/{id}/publish',
    xGuard: [userGuard, tenantGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Publish organization',
    description:
      'Publishes a draft organization, then sends the invitations it held for every role except its prepare roles. Safe to repeat: on a published organization it sends invitations an earlier call left waiting.',
    request: { params: tenantIdParamSchema },
    responses: { 200: json('Organization was published', organizationPublishResponseSchema, mockOrganizationPublishResponse()) },
  }),
  deleteOrganizations: xRoute({
    method: 'delete',
    path: '/{tenantId}/organizations',
    xGuard: [userGuard, tenantGuard],
    xRateLimiter: [bulkPointsLimiter],
    summary: 'Delete organizations',
    description:
      'Deletes organizations by ID within a tenant. Deleting archives the tenant: members lose access at once, and the organization with everything in it is removed after the archived period; until then a system admin can restore it.',
    request: { params: tenantOnlyParamSchema, body: jsonBody(idsBodySchema()) },
    responses: { 200: json('Success', batchResponseSchema()) },
  }),
});

export { organizationRoutes };
