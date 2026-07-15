/**
 * Tenant CRUD routes — system-admin only (see {@link sysAdminGuard}).
 * @see cella/ARCHITECTURE.md
 */

import { createXRoute } from '#/core/x-routes';
import { authGuard, sysAdminGuard } from '#/middlewares/guard';
import { singlePointsLimiter } from '#/middlewares/rate-limiter/limiters';
import { errorResponseRefs, paginationSchema, tenantOnlyParamSchema } from '#/schemas';
import {
  createTenantBodySchema,
  selfCreateTenantBodySchema,
  tenantListQuerySchema,
  tenantSchema,
  updateTenantBodySchema,
} from './tenants-schema';

export const tenantRoutes = {
  /**
   * Get list of tenants (system admin only)
   */
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
            schema: paginationSchema(tenantSchema),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),

  /**
   * Create a new tenant (system admin only)
   */
  createTenant: createXRoute({
    operationId: 'createTenant',
    method: 'post',
    path: '/',
    xGuard: [authGuard, sysAdminGuard],
    xRateLimiter: [singlePointsLimiter],
    tags: ['tenants', 'cella'],
    summary: 'Create a new tenant',
    description: 'Creates a new tenant. System admin access required.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: createTenantBodySchema } },
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

  /**
   * Self-serve tenant creation for authenticated users without a tenant
   */
  selfCreateTenant: createXRoute({
    operationId: 'selfCreateTenant',
    method: 'post',
    path: '/self',
    xGuard: [authGuard],
    xRateLimiter: [singlePointsLimiter],
    tags: ['tenants', 'cella'],
    summary: 'Create a tenant for yourself',
    description:
      'Creates a new tenant for the authenticated user. Only allowed if the user has no existing tenant memberships.',
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

  /**
   * Update a tenant (system admin only)
   */
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
