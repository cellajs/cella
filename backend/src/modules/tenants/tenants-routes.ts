/**
 * Tenant CRUD routes for system administrators (see {@link sysAdminGuard}).
 * @see cella/ARCHITECTURE.md
 */

import { createXRoute } from '#/core/x-routes';
import { authGuard, sysAdminGuard } from '#/middlewares/guard';
import { singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import { errorResponseRefs, paginationSchema, tenantOnlyParamSchema } from '#/schemas';
import {
  selfCreateTenantBodySchema,
  tenantListQuerySchema,
  tenantSchema,
  tenantWithOrganizationSchema,
  updateTenantBodySchema,
} from './tenants-schema';

export const tenantRoutes = {
  getTenants: createXRoute({
    operationId: 'getTenants',
    method: 'get',
    path: '/',
    xGuard: [authGuard, sysAdminGuard],
    tags: ['tenants', 'cella'],
    summary: 'Get list of tenants',
    description: 'Returns a paginated list of tenants. System admin access required.',
    request: { query: tenantListQuerySchema },
    responses: {
      200: {
        description: 'Tenants list',
        content: {
          'application/json': {
            schema: paginationSchema(tenantWithOrganizationSchema),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),

  selfCreateTenant: createXRoute({
    operationId: 'selfCreateTenant',
    method: 'post',
    path: '/self',
    xGuard: [authGuard],
    xRateLimiter: [singlePointsLimiter],
    tags: ['tenants', 'cella'],
    summary: 'Create a tenant for yourself',
    description:
      'Creates a new tenant (workspace) for the authenticated user. A user may own multiple tenants; an org-less tenant from a prior failed attempt is reused instead of creating a duplicate.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: selfCreateTenantBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Created tenant',
        content: {
          'application/json': {
            schema: tenantSchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),

  updateTenant: createXRoute({
    operationId: 'updateTenant',
    method: 'put',
    path: '/{tenantId}',
    xGuard: [authGuard, sysAdminGuard],
    xRateLimiter: [singlePointsLimiter],
    tags: ['tenants', 'cella'],
    summary: 'Update a tenant',
    description: 'Updates a tenant by ID. System admin access required.',
    request: {
      params: tenantOnlyParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: updateTenantBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Updated tenant',
        content: {
          'application/json': {
            schema: tenantSchema,
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
};
