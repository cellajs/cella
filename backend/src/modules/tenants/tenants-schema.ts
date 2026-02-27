/**
 * Tenant schema definitions for API validation.
 *
 * Tenants are system-level resources for RLS isolation.
 * Managed exclusively by system admins.
 *
 * @see info/ARCHITECTURE.md for architecture documentation
 */

import { z } from '@hono/zod-openapi';

/** Tenant status enum values */
export const tenantStatusValues = ['active', 'suspended', 'archived'] as const;
export type TenantStatus = (typeof tenantStatusValues)[number];

/** Tenant status schema */
export const tenantStatusSchema = z.enum(tenantStatusValues);

/** Restrictions: rate limits sub-schema */
const rateLimitsSchema = z.object({
  apiPointsPerHour: z.number().int().min(0).describe('Max API points per hour per user within this tenant'),
});

/** Restrictions: quotas sub-schema (entity type string → hard cap) */
const quotasSchema = z.record(z.string(), z.number().int().min(0)).describe('Entity quotas (0 = unlimited)');

/** Full restrictions schema for API responses */
const restrictionsSchema = z.object({
  quotas: quotasSchema,
  rateLimits: rateLimitsSchema,
});

/**
 * Base tenant schema for API responses.
 */
export const tenantSchema = z
  .object({
    id: z.string().max(24).describe('Lowercase alphanumeric tenant ID'),
    name: z.string().describe('Tenant display name'),
    status: tenantStatusSchema,
    restrictions: restrictionsSchema,
    createdAt: z.string(),
    modifiedAt: z.string().nullable(),
  })
  .openapi('Tenant', { description: 'A tenant representing an isolated data partition for multi-tenancy.' });

/**
 * Schema for creating a new tenant.
 */
export const createTenantBodySchema = z.object({
  name: z.string().min(1).max(255).describe('Tenant display name'),
  status: tenantStatusSchema.optional().default('active'),
});

/** Partial restrictions schema for update operations */
const partialRestrictionsSchema = z
  .object({
    quotas: quotasSchema.optional(),
    rateLimits: z
      .object({
        apiPointsPerHour: z.number().int().min(0).optional(),
      })
      .optional(),
  })
  .describe('Partial restrictions override');

/**
 * Schema for updating a tenant.
 */
export const updateTenantBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  status: tenantStatusSchema.optional(),
  restrictions: partialRestrictionsSchema.optional(),
});

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
  .openapi('TenantListQuery', { description: 'Query parameters for listing and filtering tenants.' });

/**
 * Tenant ID path parameter.
 */
export const tenantIdParamSchema = z.object({
  tenantId: z.string().max(24).describe('Tenant ID'),
});
