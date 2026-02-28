/**
 * Tenant route definitions for system admin operations.
 *
 * Tenants are system-level resources managed exclusively by admins.
 * These routes provide CRUD operations for tenant management.
 *
 * @see info/ARCHITECTURE.md for architecture documentation
 */

import { z } from '@hono/zod-openapi';
import { createXRoute } from '#/docs/x-routes';
import { authGuard, sysAdminGuard } from '#/middlewares/guard';
import { errorResponseRefs, paginationSchema } from '#/schemas';
import {
  createTenantBodySchema,
  tenantIdParamSchema,
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
    tags: ['tenants'],
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
   * Get tenant by ID (system admin only)
   */
  getTenantById: createXRoute({
    operationId: 'getTenantById',
    method: 'get',
    path: '/{tenantId}',
    xGuard: [authGuard, sysAdminGuard],
    tags: ['tenants'],
    summary: 'Get tenant by ID',
    description: 'Returns a single tenant by its ID. System admin access required.',
    request: { params: tenantIdParamSchema },
    responses: {
      200: {
        description: 'Tenant',
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
   * Create a new tenant (system admin only)
   */
  createTenant: createXRoute({
    operationId: 'createTenant',
    method: 'post',
    path: '/',
    xGuard: [authGuard, sysAdminGuard],
    tags: ['tenants'],
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
   * Update a tenant (system admin only)
   */
  updateTenant: createXRoute({
    operationId: 'updateTenant',
    method: 'put',
    path: '/{tenantId}',
    xGuard: [authGuard, sysAdminGuard],
    tags: ['tenants'],
    summary: 'Update a tenant',
    description: 'Updates a tenant by ID. System admin access required.',
    request: {
      params: tenantIdParamSchema,
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

  /**
   * Archive a tenant (system admin only)
   * Sets status to 'archived' for soft deletion.
   */
  archiveTenant: createXRoute({
    operationId: 'archiveTenant',
    method: 'delete',
    path: '/{tenantId}',
    xGuard: [authGuard, sysAdminGuard],
    tags: ['tenants'],
    summary: 'Archive a tenant',
    description:
      'Archives a tenant (soft delete). Sets status to "archived". System admin access required. Data retention period applies before permanent deletion.',
    request: { params: tenantIdParamSchema },
    responses: {
      200: {
        description: 'Archived tenant',
        content: {
          'application/json': {
            schema: z.object({ success: z.boolean() }),
          },
        },
      },
      ...errorResponseRefs,
    },
  }),
};

export default tenantRoutes;
