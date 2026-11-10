import { createXRoutes, errors, json, jsonBody, xRoute } from '#/core/x-routes';
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
import { batchResponseSchema, idsBodySchema, paginationSchema, slugIncludeQuerySchema, tenantOnlyParamSchema, tenantOrgParamSchema } from '#/schemas';

export const organizationRoutes = createXRoutes(['organizations', 'cella', 'channel'], {
  batchCreateOrganizations: xRoute({
    method: 'post',
    path: '/~batch-create',
    xGuard: [userGuard, tenantGuard],
    xRateLimiter: [insertEntityLock, bulkPointsLimiter],
    summary: 'Create organizations',
    description: 'Creates one or more new organizations within a tenant.',
    request: { params: tenantOnlyParamSchema, body: jsonBody(organizationCreateBodySchema) },
    responses: { 201: json('Organizations were created', batchResponseSchema(organizationWithMembershipSchema), mockBatchOrganizationsResponse()) },
  }),
  listOrganizations: xRoute({
    method: 'get',
    path: '/',
    xGuard: [userGuard, relatableGuard],
    xAnonymous: true,
    summary: 'Get list of organizations',
    description: 'Returns a list of organizations across tenants: the `-` tenant reads every tenant.',
    request: { query: organizationListQuerySchema },
    responses: { 200: json('Organizations', paginationSchema(organizationSchema), mockPaginatedOrganizationsResponse()) },
  }),
  getOrganization: xRoute({
    method: 'get',
    path: '/{organizationId}',
    xGuard: [actorGuard, tenantGuard],
    xScope: 'organization:read',
    summary: 'Get organization',
    description: 'Retrieves an organization by ID within a tenant. Pass ?slug=true to resolve by slug instead.',
    request: { params: tenantOrgParamSchema, query: slugIncludeQuerySchema },
    responses: { 200: json('Organization', organizationSchema), ...errors(404) },
  }),
  updateOrganization: xRoute({
    method: 'patch',
    path: '/{organizationId}',
    xGuard: [actorGuard, tenantGuard],
    xScope: 'organization:write',
    xRateLimiter: [singlePointsLimiter],
    summary: 'Update organization',
    description: 'Updates an organization within a tenant.',
    request: { params: tenantOrgParamSchema, body: jsonBody(organizationUpdateBodySchema, mockUpdateOrganizationBody()) },
    responses: { 200: json('Organization was updated', organizationSchema), ...errors(404, 409) },
  }),
  publishOrganization: xRoute({
    method: 'post',
    path: '/{organizationId}/~publish',
    xGuard: [userGuard, tenantGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Publish organization',
    description:
      'Publishes a draft organization, then sends the invitations it held for every role except its prepare roles. Safe to repeat: on a published organization it sends invitations an earlier call left waiting.',
    request: { params: tenantOrgParamSchema },
    responses: { 200: json('Organization was published', organizationPublishResponseSchema, mockOrganizationPublishResponse()), ...errors(404) },
  }),
  batchDeleteOrganizations: xRoute({
    method: 'post',
    path: '/~batch-delete',
    xGuard: [userGuard, tenantGuard],
    xRateLimiter: [bulkPointsLimiter],
    summary: 'Delete organizations',
    description:
      'Deletes organizations by ID within a tenant. Deleting archives the tenant: members lose access at once, and the organization with everything in it is removed after the archived period; until then a system admin can restore it.',
    request: { params: tenantOnlyParamSchema, body: jsonBody(idsBodySchema()) },
    responses: { 200: json('Success', batchResponseSchema()) },
  }),
});
