import { createXRoutes, errors, json, jsonBody, xRoute } from '#/core/x-routes';
import { sysAdminGuard, userGuard } from '#/middlewares/guard';
import { singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import { mockPaginatedTenantsResponse } from '#/modules/tenants/tenants-mocks';
import { selfCreateTenantBodySchema, tenantListQuerySchema, tenantSchema, updateTenantBodySchema } from '#/modules/tenants/tenants-schema';
import { paginationSchema, tenantOnlyParamSchema } from '#/schemas';

const tenantRoutes = createXRoutes(['tenants', 'cella'], {
  getTenants: xRoute({
    method: 'get',
    path: '/',
    xGuard: [userGuard, sysAdminGuard],
    summary: 'Get list of tenants',
    description: 'Returns a paginated list of tenants. System admin access required.',
    request: { query: tenantListQuerySchema },
    responses: { 200: json('Tenants list', paginationSchema(tenantSchema), mockPaginatedTenantsResponse()) },
  }),

  selfCreateTenant: xRoute({
    method: 'post',
    path: '/self',
    xGuard: [userGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Create a tenant for yourself',
    description:
      'Creates a new tenant (workspace) for the authenticated user. A user may create several, up to the number the app allows; ' +
      'an org-less tenant from a prior failed attempt is reused, and takes the new name.',
    request: { body: jsonBody(selfCreateTenantBodySchema) },
    responses: { 200: json('Created tenant', tenantSchema), ...errors(403) },
  }),

  updateTenant: xRoute({
    method: 'put',
    path: '/{tenantId}',
    xGuard: [userGuard, sysAdminGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Update a tenant',
    description: 'Updates a tenant by ID. System admin access required.',
    request: { params: tenantOnlyParamSchema, body: jsonBody(updateTenantBodySchema) },
    responses: { 200: json('Updated tenant', tenantSchema), ...errors(404) },
  }),
});

export { tenantRoutes };
