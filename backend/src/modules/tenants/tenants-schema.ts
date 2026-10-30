import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { createInsertSchema, createSelectSchema } from '#/db/utils/drizzle-schema';
import { authStrategiesEnum } from '#/modules/auth/sessions/sessions-db';
import { quotaKeys } from '#/modules/tenants/tenant-restrictions';
import { subscriptionStatusValues, tenantStatusValues, tenantsTable } from '#/modules/tenants/tenants-db';
import { mockTenantResponse } from '#/modules/tenants/tenants-mocks';
import { minimalBaseSchema, paginationQuerySchema, validNameSchema } from '#/schemas';
import { auditShape } from '#/schemas/entity-base';

const tenantStatusSchema = z.enum(tenantStatusValues);
const subscriptionStatusSchema = z.enum(subscriptionStatusValues);

const rateLimitsSchema = z.object({
  apiPointsPerHour: z
    .number()
    .int()
    .min(0)
    .describe('Max API points per hour per actor within this tenant (0 = no tenant limit; the global safety ceiling still applies)'),
  invitationMailsPerDay: z
    .number()
    .int()
    .min(0)
    .describe('Max invitation mails per day the tenant sends, new, reminded and reopened alike (0 = no cap)'),
});

const quotasSchema = z
  .record(z.string(), z.number().int().min(0))
  .describe('Caps per tenant on entities, service accounts and API keys (0 = unlimited)');

const restrictionsSchema = z.object({
  quotas: quotasSchema,
  rateLimits: rateLimitsSchema,
  allowUnregisteredClients: z
    .boolean()
    .describe('Whether members may consent to OAuth clients that have no registration (AI clients using a Client ID Metadata Document)'),
});

export const tenantSchema = z
  .object({
    ...createSelectSchema(tenantsTable, {
      restrictions: restrictionsSchema,
      authStrategies: z.array(z.enum(authStrategiesEnum)),
    }).shape,
    ...auditShape,
    organization: minimalBaseSchema('organization').nullable().describe('The organization this tenant holds, or null if none'),
  })
  .openapi('Tenant', {
    description:
      'The top-level isolation and billing boundary. Tenant and organization are 1:1: a tenant holds one organization, or none until that organization is created. System admins list and update tenants; a signed-in user can create one of their own.',
    example: mockTenantResponse(),
    'x-tags': schemaTags('data', 'tenants', 'cella'),
  });

export const selfCreateTenantBodySchema = createInsertSchema(tenantsTable, { name: validNameSchema }).pick({ name: true });

const partialRestrictionsSchema = z
  .object({
    quotas: z
      .partialRecord(z.enum(quotaKeys), z.number().int().min(0))
      .optional()
      .describe('Caps per tenant on entities, service accounts and API keys (0 = unlimited)'),
    allowUnregisteredClients: z.boolean().optional(),
    rateLimits: rateLimitsSchema.partial().optional(),
  })
  .describe('Partial restrictions override');

export const updateTenantBodySchema = createInsertSchema(tenantsTable, {
  name: validNameSchema,
  status: tenantStatusSchema,
  subscriptionStatus: subscriptionStatusSchema,
  authStrategies: z.array(z.enum(authStrategiesEnum)).max(authStrategiesEnum.length),
})
  .pick({ name: true, status: true, subscriptionId: true, subscriptionStatus: true, subscriptionPlan: true, authStrategies: true })
  .partial()
  .extend({ restrictions: partialRestrictionsSchema.optional() });

export const tenantListQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['createdAt', 'name']).default('createdAt'),
  status: tenantStatusSchema.optional().describe('Filter by status'),
});
