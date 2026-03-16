import { z } from '@hono/zod-openapi';
import { domainsTable } from '#/db/schema/domains';
import { createInsertSchema, createSelectSchema } from '#/db/utils/drizzle-schema';
import { entityIdParamSchema, tenantOnlyParamSchema } from '#/schemas';

/**
 * Domain schema for API responses (excludes verificationToken).
 */
export const domainSchema = z
  .object({
    ...createSelectSchema(domainsTable).omit({ verificationToken: true }).shape,
  })
  .openapi('Domain', { description: 'A domain claimed by a tenant for email matching and verification.' });

/**
 * Domain schema including verificationToken — used for the detail/verify endpoints
 * so the admin can see the DNS TXT record value they need to configure.
 */
export const domainWithTokenSchema = z
  .object({
    ...createSelectSchema(domainsTable).shape,
  })
  .openapi('DomainWithToken', { description: 'A domain with its verification token for DNS setup.' });

/**
 * Response schema for domain verification attempts.
 */
export const verifyDomainResponseSchema = z
  .object({
    success: z.boolean(),
    domain: domainWithTokenSchema,
    diagnostics: z
      .object({
        recordsFound: z.array(z.string()),
        expectedToken: z.string(),
      })
      .optional(),
  })
  .openapi('VerifyDomainResponse', { description: 'Result of a DNS TXT domain verification attempt.' });

/**
 * Schema for adding a domain to a tenant.
 */
export const createDomainBodySchema = createInsertSchema(domainsTable, {
  domain: z
    .string()
    .min(4)
    .max(255)
    .regex(/^[a-z0-9].*[a-z0-9]$/i, 'Invalid domain format')
    .refine((s) => s.includes('.'), 'Domain must contain a dot')
    .transform((s) => s.toLowerCase().trim()),
}).pick({ domain: true });

/**
 * Tenant ID + domain ID path parameters.
 */
export const domainParamSchema = tenantOnlyParamSchema.merge(entityIdParamSchema);
