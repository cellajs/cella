import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { createInsertSchema, createSelectSchema } from '#/db/utils/drizzle-schema';
import { authStrategiesEnum } from '#/modules/auth/sessions-db';
import { subscriptionStatusValues, tenantStatusValues, tenantsTable } from '#/modules/tenants/tenants-db';
import { nullableOrganizationMinimalBaseSchema, paginationQuerySchema, validNameSchema } from '#/schemas';

export type TenantStatus = (typeof tenantStatusValues)[number];

const tenantStatusSchema = z.enum(tenantStatusValues);
const subscriptionStatusSchema = z.enum(subscriptionStatusValues);

const rateLimitsSchema = z.object({
  apiPointsPerHour: z
    .number()
    .int()
    .min(0)
    .describe(
      'Max API points per hour per user within this tenant (0 = no tenant limit; the global safety ceiling still applies)',
    ),
});

const quotasSchema = z.record(z.string(), z.number().int().min(0)).describe('Entity quotas (0 = unlimited)');

const restrictionsSchema = z.object({
  quotas: quotasSchema,
  rateLimits: rateLimitsSchema,
});

export const tenantSchema = z
  .object({
    ...createSelectSchema(tenantsTable, {
      restrictions: restrictionsSchema,
      authStrategies: z.array(z.enum(authStrategiesEnum)),
    }).omit({ subscriptionData: true }).shape,
    domainsCount: z.number().int().describe('Number of domains claimed by this tenant'),
  })
  .openapi('Tenant', {
    description: 'A tenant representing an isolated data partition for multi-tenancy.',
    'x-tags': schemaTags('data', 'tenants', 'cella'),
  });

export const tenantWithOrganizationSchema = tenantSchema
  .extend({
    organization: nullableOrganizationMinimalBaseSchema.describe('The organization this tenant holds, or null if none'),
  })
  .openapi('TenantWithOrganization', {
    description: 'A tenant together with the single organization it holds.',
    'x-tags': schemaTags('data', 'tenants', 'cella'),
  });

export const selfCreateTenantBodySchema = createInsertSchema(tenantsTable, {
  name: validNameSchema,
}).pick({ name: true });

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

export const updateTenantBodySchema = createInsertSchema(tenantsTable, {
  name: validNameSchema,
  status: tenantStatusSchema,
  subscriptionStatus: subscriptionStatusSchema,
  // Allowed sign-in strategies for the tenant's members (empty = all enabled); tenantGuard enforcement waits on the SSO build.
  authStrategies: z.array(z.enum(authStrategiesEnum)),
})
  .pick({
    name: true,
    status: true,
    subscriptionId: true,
    subscriptionStatus: true,
    subscriptionPlan: true,
    authStrategies: true,
  })
  .partial()
  .extend({
    restrictions: partialRestrictionsSchema.optional(),
  });

export const tenantListQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['createdAt', 'name']).default('createdAt'),
  status: tenantStatusSchema.optional().describe('Filter by status'),
});
