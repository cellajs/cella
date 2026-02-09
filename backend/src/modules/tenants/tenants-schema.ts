/**
 * Tenant schema definitions for API validation.
 *
 * Tenants are system-level resources for RLS isolation.
 * Managed exclusively by system admins.
 *
 * @see info/RLS.md for architecture documentation
 */

import { z } from '@hono/zod-openapi';

/** Tenant status enum values */
export const tenantStatusValues = ['active', 'suspended', 'archived'] as const;
export type TenantStatus = (typeof tenantStatusValues)[number];

/** Tenant status schema */
export const tenantStatusSchema = z.enum(tenantStatusValues).openapi('TenantStatus');

/**
 * Base tenant schema for API responses.
 */
export const tenantSchema = z
  .object({
    id: z.string().max(6).describe('6-character lowercase alphanumeric tenant ID'),
    name: z.string().describe('Tenant display name'),
    status: tenantStatusSchema,
    createdAt: z.string(),
    modifiedAt: z.string().nullable(),
  })
  .openapi('Tenant');

/**
 * Schema for creating a new tenant.
 */
export const createTenantBodySchema = z
  .object({
    name: z.string().min(1).max(255).describe('Tenant display name'),
    status: tenantStatusSchema.optional().default('active'),
  })
  .openapi('CreateTenantBody');

/**
 * Schema for updating a tenant.
 */
export const updateTenantBodySchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    status: tenantStatusSchema.optional(),
  })
  .openapi('UpdateTenantBody');

/**
 * Query params for listing tenants.
 */
export const tenantListQuerySchema = z
  .object({
    q: z.string().optional().describe('Search query'),
    status: tenantStatusSchema.optional().describe('Filter by status'),
    limit: z.string().optional().default('50'),
    offset: z.string().optional().default('0'),
    sort: z.enum(['createdAt', 'name']).optional().default('createdAt'),
    order: z.enum(['asc', 'desc']).optional().default('desc'),
  })
  .openapi('TenantListQuery');

/**
 * Tenant ID path parameter.
 */
export const tenantIdParamSchema = z.object({
  tenantId: z.string().max(6).describe('6-character tenant ID'),
});
