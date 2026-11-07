import { z } from '@hono/zod-openapi';
import { recordFromKeys, tenantKindValues } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { createInsertSchema, createSelectSchema } from '#/db/utils/drizzle-schema';
import { authStrategiesEnum } from '#/modules/auth/sessions/sessions-db';
import { quotaKeys } from '#/modules/tenants/tenant-restrictions';
import { subscriptionStatusValues, tenantStatusValues, tenantsTable } from '#/modules/tenants/tenants-db';
import { mockTenantResponse } from '#/modules/tenants/tenants-mocks';
import { csvQuerySchema, listQuerySchema, minimalBaseSchema, orderByQuerySchema, validNameSchema } from '#/schemas';
import { auditShape } from '#/schemas/entity-base';
import { mergePatchSchema } from '#/schemas/merge-patch-schema';

const tenantStatusSchema = z.enum(tenantStatusValues);
const subscriptionStatusSchema = z.enum(subscriptionStatusValues);
const tenantKindSchema = z.enum(tenantKindValues);

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
  .object(recordFromKeys(quotaKeys, () => z.number().int().min(0)))
  .describe('Caps per tenant on entities, service accounts and API keys (0 = unlimited)');

const restrictionsSchema = z.object({
  quotas: quotasSchema,
  rateLimits: rateLimitsSchema,
  allowUnregisteredClients: z
    .boolean()
    .describe('Whether members may consent to OAuth clients that have no registration (AI clients using a Client ID Metadata Document)'),
});

/** What a tenant may hold and spend, stored on its row (`tenants.restrictions`). */
export type Restrictions = z.infer<typeof restrictionsSchema>;

export const tenantSchema = z
  .object({
    ...createSelectSchema(tenantsTable, {
      kind: tenantKindSchema.describe('What the tenant is for: `live` serves customers, `test` staff and automated runs, `demo` a visitor.'),
      expiresAt: z.union([z.string(), z.null()]).describe('When the tenant goes with everything in it; a demo always carries one.'),
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

export const updateTenantBodySchema = createInsertSchema(tenantsTable, {
  name: validNameSchema,
  kind: tenantKindSchema.describe('`live` or `test`: a demo is never made or unmade by an update.'),
  status: tenantStatusSchema,
  subscriptionStatus: subscriptionStatusSchema,
  authStrategies: z.array(z.enum(authStrategiesEnum)).max(authStrategiesEnum.length),
})
  .pick({ name: true, kind: true, status: true, subscriptionId: true, subscriptionStatus: true, subscriptionPlan: true, authStrategies: true })
  .partial()
  .extend({
    restrictions: mergePatchSchema(restrictionsSchema)
      .optional()
      .describe("A merge patch of the tenant's restrictions: a member left out keeps its value, and `null` gives it its default again."),
  });

/** The kind filter of an admin list: absent lists the kinds `appConfig.tenantKinds` marks `listed`. */
export const tenantKindsQuerySchema = csvQuerySchema(tenantKindSchema, tenantKindValues.length).describe(
  'Kinds to list, comma-separated (`live`, `test`, `demo`); absent lists the kinds the app lists by default.',
);

export const tenantListQuerySchema = listQuerySchema.extend({
  orderBy: orderByQuerySchema(['createdAt', 'name'], 'createdAt desc'),
  status: tenantStatusSchema.optional().describe('Filter by status'),
  kind: tenantKindsQuerySchema,
});
