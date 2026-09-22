import { z } from '@hono/zod-openapi';
import { appConfig, type EntityRole, hierarchy, scopes } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { credentialsTable } from '#/modules/service-accounts/credentials-db';
import { serviceAccountStatuses, serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { maxLength, paginationQuerySchema, validIdSchema, validNameSchema } from '#/schemas';
import {
  mockCreatedCredentialResponse,
  mockCredentialResponse,
  mockServiceAccountResponse,
} from './service-accounts-mocks';

const organizationRoles = hierarchy.getRoles('organization') as [EntityRole, ...EntityRole[]];
/** `scopes.all` is derived from the policy matrix; an empty matrix would make this enum empty, which zod rejects. */
const scopeEnum = z.enum(scopes.all as unknown as [string, ...string[]]);

export const serviceGrantSchema = z.object({
  channelType: z.enum(appConfig.channelEntityTypes),
  channelId: validIdSchema,
  organizationId: validIdSchema,
  role: z.enum(organizationRoles),
});

export const serviceAccountSchema = z
  .object({
    ...createSelectSchema(serviceAccountsTable).shape,
    status: z.enum(serviceAccountStatuses),
    grants: z.array(serviceGrantSchema),
  })
  .openapi('ServiceAccount', {
    description: 'A machine principal: the actor an API key runs as, with its role bindings.',
    example: mockServiceAccountResponse(),
    'x-tags': schemaTags('service-accounts', 'cella'),
  });

export const credentialSchema = createSelectSchema(credentialsTable)
  .omit({ hash: true })
  .extend({ scopes: z.array(scopeEnum).nullable() })
  .openapi('Credential', {
    description: 'An API key of a service account; the secret is never returned after creation.',
    example: mockCredentialResponse(),
    'x-tags': schemaTags('service-accounts', 'cella'),
  });

/** Returned once, at creation or roll: the only time the plaintext key exists outside the caller. */
export const createdCredentialSchema = credentialSchema
  .extend({ secret: z.string().describe('The plaintext API key; store it now, it is not shown again.') })
  .openapi('CreatedCredential', {
    description: 'A newly issued API key with its plaintext secret.',
    example: mockCreatedCredentialResponse(),
    'x-tags': schemaTags('service-accounts', 'cella'),
  });

const credentialInputSchema = z.object({
  name: validNameSchema,
  description: z.string().max(maxLength.field).optional(),
  /** Mask over the account's grants. Omitted or null = every scope the grants allow. */
  scopes: z.array(scopeEnum).min(1).nullable().optional(),
  expiresAt: z.string().datetime().optional(),
});

export const createCredentialBodySchema = credentialInputSchema.extend({
  /** Roll: issue this key as the successor of an existing one, which keeps working for `rollOverlapDays`. */
  rollFrom: validIdSchema.optional(),
  rollOverlapDays: z.number().int().min(0).max(30).default(7),
});

export const createServiceAccountBodySchema = z.object({
  name: validNameSchema,
  description: z.string().max(maxLength.field).optional(),
  /** Organization role of the account; capped at the creator's own role. */
  role: z.enum(organizationRoles),
  /** One-step "create API key": the first key is issued together with the account. */
  key: credentialInputSchema.optional(),
});

export const updateServiceAccountBodySchema = z.object({
  name: validNameSchema.optional(),
  description: z.string().max(maxLength.field).nullable().optional(),
  status: z.enum(serviceAccountStatuses).optional(),
});

export const createServiceAccountResponseSchema = z.object({
  serviceAccount: serviceAccountSchema,
  credential: createdCredentialSchema.optional(),
});

export const credentialsResponseSchema = z.object({ items: z.array(credentialSchema) });

export const serviceAccountListQuerySchema = paginationQuerySchema.pick({ q: true, offset: true, limit: true });

export type ServiceGrantInput = z.infer<typeof serviceGrantSchema>;
export type CreateServiceAccountInput = z.infer<typeof createServiceAccountBodySchema>;
export type UpdateServiceAccountInput = z.infer<typeof updateServiceAccountBodySchema>;
export type CreateCredentialInput = z.infer<typeof createCredentialBodySchema>;
export type ServiceAccountListQuery = z.infer<typeof serviceAccountListQuerySchema>;
