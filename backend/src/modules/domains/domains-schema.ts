import { z } from '@hono/zod-openapi';
import { createInsertSchema, createSelectSchema } from '#/db/utils/drizzle-schema';
import { domainsTable } from '#/modules/domains/domains-db';
import { entityIdParamSchema, tenantOnlyParamSchema, validDomainSchema } from '#/schemas';

export const domainSchema = z.object({
  ...createSelectSchema(domainsTable).omit({ verificationToken: true }).shape,
});

/** Includes verificationToken: the DNS TXT record value an admin must configure. */
export const domainWithTokenSchema = z.object({
  ...createSelectSchema(domainsTable).shape,
});

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

export const createDomainBodySchema = createInsertSchema(domainsTable, {
  domain: validDomainSchema,
}).pick({ domain: true });

export const domainParamSchema = tenantOnlyParamSchema.merge(entityIdParamSchema);
