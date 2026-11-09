import { createXRoutes, errors, json, jsonBody, xRoute } from '#/core/x-routes';
import { publicGuard, sysAdminGuard, userGuard } from '#/middlewares/guard';
import { isNoBot } from '#/middlewares/is-no-bot';
import { demoLimiter, singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import { mockPaginatedTenantsResponse, mockTenantResponse } from '#/modules/tenants/tenants-mocks';
import { selfCreateTenantBodySchema, tenantListQuerySchema, tenantSchema, updateTenantBodySchema } from '#/modules/tenants/tenants-schema';
import { paginationSchema, tenantOnlyParamSchema } from '#/schemas';

const tenantRoutes = createXRoutes(['tenants', 'cella'], {
  listTenants: xRoute({
    method: 'get',
    path: '/',
    xGuard: [userGuard, sysAdminGuard],
    summary: 'Get list of tenants',
    description: 'Returns a paginated list of tenants of the listed kinds, or of the kinds named. System admin access required.',
    request: { query: tenantListQuerySchema },
    responses: { 200: json('Tenants list', paginationSchema(tenantSchema), mockPaginatedTenantsResponse()) },
  }),

  createTenant: xRoute({
    method: 'post',
    path: '/',
    xGuard: [userGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Create a tenant for yourself',
    description:
      'Creates a new tenant (workspace) for the authenticated user. A user may create several, up to the number the app allows; ' +
      'an org-less tenant from a prior failed attempt is reused, and takes the new name. A demo session creates none.',
    request: { body: jsonBody(selfCreateTenantBodySchema) },
    responses: { 201: json('Created tenant', tenantSchema), ...errors(403) },
  }),

  updateTenant: xRoute({
    method: 'patch',
    path: '/{tenantId}',
    xGuard: [userGuard, sysAdminGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Update a tenant',
    description: 'Updates a tenant by ID. System admin access required. The kind moves between `live` and `test`; a demo stays a demo.',
    request: { params: tenantOnlyParamSchema, body: jsonBody(updateTenantBodySchema) },
    responses: { 200: json('Updated tenant', tenantSchema), ...errors(404) },
  }),
});

const demoRoutes = createXRoutes(['tenants', 'cella'], {
  createDemo: xRoute({
    method: 'post',
    path: '/',
    xGuard: [publicGuard],
    xRateLimiter: [demoLimiter],
    xEnabledBy: { feature: 'demos' },
    middleware: isNoBot,
    summary: 'Take a demo',
    description:
      'Gives this browser a demo: a throwaway account signed in by a demo session, with a tenant of kind `demo` and the organization it administers, ' +
      'filled by the app. The tenant goes after the demo period with everything in it and the account. A demo session invites no one, creates no ' +
      'tenant, adds no sign-in method and hands out no lasting access. A browser that holds a demo gets it back; one whose demo ended gets a new one.',
    responses: {
      201: json('Created demo', tenantSchema, mockTenantResponse('tenant:demo')),
      200: json('Your demo', tenantSchema, mockTenantResponse('tenant:demo')),
      ...errors(409),
    },
  }),
});

export { demoRoutes, tenantRoutes };
