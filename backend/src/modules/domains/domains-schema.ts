import { z } from '@hono/zod-openapi';
import { createInsertSchema, createSelectSchema } from '#/db/utils/drizzle-schema';
import { domainsTable } from '#/modules/domains/domains-db';
import { entityIdParamSchema, tenantOnlyParamSchema, validDomainSchema } from '#/schemas';

/**
 * Domain schema for API responses (excludes verificationToken).
 */
export const domainSchema = z.object({
  ...createSelectSchema(domainsTable).omit({ verificationToken: true }).shape,
});

/**
 * Domain schema including verificationToken for the detail/verify endpoints,
 * so the admin can see the DNS TXT record value they need to configure.
 */
export const domainWithTokenSchema = z.object({
  ...createSelectSchema(domainsTable).shape,
});

/**
 * Response schema for domain verification attempts.
 */
export const verifyDomainResponseSchema = z.object({
  success: z.boolean(),
  domain: domainWithTokenSchema,
  diagnostics: z
    .object({
      recordsFound: z.array(z.string()),
      expectedToken: z.string(),
    })
    .optional(),
});

/**
 * Schema for adding a domain to a tenant.
 */
export const createDomainBodySchema = createInsertSchema(domainsTable, {
  domain: validDomainSchema,
}).pick({ domain: true });

/**
 * Tenant ID + domain ID path parameters.
 */
export const domainParamSchema = tenantOnlyParamSchema.merge(entityIdParamSchema);
