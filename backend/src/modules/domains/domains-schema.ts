import { z } from '@hono/zod-openapi';
import { domainTypeEnum, sslStatusEnum, verificationStatusEnum } from '#/db/schema/domains';
import { paginationQuerySchema } from '#/utils/schema/common';

/** Zod enums for domain status fields */
export const verificationStatusZodEnum = z.enum(verificationStatusEnum);
export const sslStatusZodEnum = z.enum(sslStatusEnum);
export const domainTypeZodEnum = z.enum(domainTypeEnum);

/** Schema for a domain object */
export const domainSchema = z.object({
  id: z.string(),
  fqdn: z.string(),
  type: domainTypeZodEnum,
  verificationStatus: verificationStatusZodEnum,
  verificationToken: z.string().nullable(),
  verificationMethod: z.enum(['cname', 'txt']).nullable(),
  sslStatus: sslStatusZodEnum,
  scalewayPipelineId: z.string().nullable(),
  scalewayDnsStageId: z.string().nullable(),
  repositoryId: z.string(),
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
});

/** Schema for adding a custom domain */
export const addDomainBodySchema = z.object({
  fqdn: z
    .string()
    .min(3)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i, 'Invalid domain format')
    .openapi({ example: 'app.example.com' }),
  repositoryId: z.string().openapi({ description: 'Repository to associate the domain with' }),
});

/** Schema for domain list response */
export const domainsListSchema = z.object({
  items: z.array(domainSchema),
  total: z.number(),
});

/** Schema for domain list query parameters */
export const domainListQuerySchema = paginationQuerySchema.extend({
  repositoryId: z.string().optional().openapi({ description: 'Filter by repository' }),
  verificationStatus: verificationStatusZodEnum.optional(),
});

/** Schema for DNS verification instructions */
export const dnsInstructionsSchema = z.object({
  domainId: z.string(),
  fqdn: z.string(),
  recordType: z.enum(['CNAME', 'TXT']),
  recordName: z.string().openapi({ description: 'DNS record name to create' }),
  recordValue: z.string().openapi({ description: 'Value to set for the DNS record' }),
  instructions: z.string().openapi({ description: 'Human-readable setup instructions' }),
});

/** Schema for verification check result */
export const verificationResultSchema = z.object({
  domainId: z.string(),
  verified: z.boolean(),
  status: verificationStatusZodEnum,
  message: z.string(),
});

/** Domain with repository info for list views */
export const domainWithRepositorySchema = domainSchema.extend({
  repository: z.object({
    id: z.string(),
    githubFullName: z.string(),
    defaultDomain: z.string().nullable(),
  }),
});

export type Domain = z.infer<typeof domainSchema>;
export type DomainWithRepository = z.infer<typeof domainWithRepositorySchema>;
export type AddDomainBody = z.infer<typeof addDomainBodySchema>;
export type DnsInstructions = z.infer<typeof dnsInstructionsSchema>;
export type VerificationResult = z.infer<typeof verificationResultSchema>;
