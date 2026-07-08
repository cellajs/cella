import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { createInsertSchema, createSelectSchema } from '#/db/utils/drizzle-schema';
import { subscriptionStatusValues, tenantStatusValues, tenantsTable } from '#/modules/tenants/tenants-db';
import { paginationQuerySchema, validNameSchema } from '#/schemas';

/** Tenant status enum values */
export type TenantStatus = (typeof tenantStatusValues)[number];

/** Tenant status schema */
const tenantStatusSchema = z.enum(tenantStatusValues);
const subscriptionStatusSchema = z.enum(subscriptionStatusValues);

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
 * Tenants are system-level resources for RLS isolation managed by system admins.
 */
export const tenantSchema = z
  .object({
    ...createSelectSchema(tenantsTable, {
      restrictions: restrictionsSchema,
    }).omit({ subscriptionData: true }).shape,
    domainsCount: z.number().int().describe('Number of domains claimed by this tenant'),
  })
  .openapi('Tenant', {
    description: 'A tenant representing an isolated data partition for multi-tenancy.',
    'x-tags': schemaTags('data', 'tenants', 'cella'),
  });

/**
 * Schema for creating a new tenant.
 */
export const createTenantBodySchema = createInsertSchema(tenantsTable, {
  name: validNameSchema,
}).pick({ name: true, status: true });

/**
 * Schema for self-serve tenant creation by authenticated users.
 */
export const selfCreateTenantBodySchema = createInsertSchema(tenantsTable, {
  name: validNameSchema,
}).pick({ name: true });

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
export const updateTenantBodySchema = createInsertSchema(tenantsTable, {
  name: validNameSchema,
  status: tenantStatusSchema,
  subscriptionStatus: subscriptionStatusSchema,
})
  .pick({
    name: true,
    status: true,
    subscriptionId: true,
    subscriptionStatus: true,
    subscriptionPlan: true,
  })
  .partial()
  .extend({
    restrictions: partialRestrictionsSchema.optional(),
  });

/**
 * Query params for listing tenants.
 */
export const tenantListQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['createdAt', 'name']).default('createdAt').optional(),
  status: tenantStatusSchema.optional().describe('Filter by status'),
});
