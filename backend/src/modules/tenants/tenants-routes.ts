/**
 * Tenant CRUD routes for system administrators (see {@link sysAdminGuard}).
 * @see cella/ARCHITECTURE.md
 */

import { createXRoutes, json, jsonBody, xRoute } from '#/core/x-routes';
import { sysAdminGuard, userGuard } from '#/middlewares/guard';
import { singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import { paginationSchema, tenantOnlyParamSchema } from '#/schemas';
import { selfCreateTenantBodySchema, tenantListQuerySchema, tenantSchema, updateTenantBodySchema } from './tenants-schema';

export const tenantRoutes = createXRoutes(['tenants', 'cella'], {
  getTenants: xRoute({
    method: 'get',
    path: '/',
    xGuard: [userGuard, sysAdminGuard],
    summary: 'Get list of tenants',
    description: 'Returns a paginated list of tenants. System admin access required.',
    request: { query: tenantListQuerySchema },
    responses: { 200: json('Tenants list', paginationSchema(tenantSchema)) },
  }),

  selfCreateTenant: xRoute({
    method: 'post',
    path: '/self',
    xGuard: [userGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Create a tenant for yourself',
    description:
      'Creates a new tenant (workspace) for the authenticated user. A user may own multiple tenants; an org-less tenant from a prior failed attempt is reused instead of creating a duplicate.',
    request: { body: jsonBody(selfCreateTenantBodySchema) },
    responses: { 200: json('Created tenant', tenantSchema) },
  }),

  updateTenant: xRoute({
    method: 'put',
    path: '/{tenantId}',
    xGuard: [userGuard, sysAdminGuard],
    xRateLimiter: [singlePointsLimiter],
    summary: 'Update a tenant',
    description: 'Updates a tenant by ID. System admin access required.',
    request: { params: tenantOnlyParamSchema, body: jsonBody(updateTenantBodySchema) },
    responses: { 200: json('Updated tenant', tenantSchema) },
  }),
});
