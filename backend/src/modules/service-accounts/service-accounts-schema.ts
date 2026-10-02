import { z } from '@hono/zod-openapi';
import { type AccessScope, accessScopes, appConfig, hierarchy, type OrganizationRole, roles } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { apiKeysTable } from '#/modules/service-accounts/api-keys-db';
import { serviceAccountStatuses, serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { idInTenantOrgParamSchema, paginationQuerySchema, validIdSchema, validNameSchema } from '#/schemas';
import { mockApiKeyResponse, mockCreatedApiKeyResponse, mockServiceAccountResponse } from './service-accounts-mocks';

// `getRoles` returns a readonly array; a channel always has at least one role, which zod's enum needs to see.
const organizationRoles = hierarchy.getRoles('organization') as [OrganizationRole, ...OrganizationRole[]];
/** Derived from the policy matrix (non-empty by construction): the only values a key may be narrowed to. */
// The template configuration always carries a policy, so the vocabulary is never empty where keys are issued.
const scopeEnum = z.enum(accessScopes.all as [AccessScope, ...AccessScope[]]);

const roleBindingSchema = z.object({
  channelType: z.enum(appConfig.channelEntityTypes),
  channelId: validIdSchema,
  organizationId: validIdSchema,
  // A binding carries its channel's role, and a channel may declare roles the organization does not.
  role: z.enum(roles.all),
});

/** The route addresses one key of one account. */
export const apiKeyParamSchema = idInTenantOrgParamSchema.extend({ keyId: validIdSchema });

/** `createdBy` / `updatedBy` stay actor ids: the audit-user hydration resolves users only (service badge is a follow-up). */
export const serviceAccountSchema = z
  .object({ ...createSelectSchema(serviceAccountsTable).shape, status: z.enum(serviceAccountStatuses), bindings: z.array(roleBindingSchema) })
  .openapi('ServiceAccount', {
    description:
      'An actor that is not a person, in one tenant: API keys run as it, and it holds role bindings like a member holds memberships. An organization admin creates one, for example with Create API key in organization settings.',
    example: mockServiceAccountResponse(),
    'x-tags': schemaTags('data', 'service-accounts', 'cella'),
  });

export const apiKeySchema = createSelectSchema(apiKeysTable)
  .extend({ scopes: z.array(scopeEnum).nullable() })
  .openapi('ApiKey', {
    description:
      'A secret key a service account authenticates with, sent as `Authorization: Bearer` or `x-api-key`. Only its prefix and last four characters are returned after creation; it can expire and be revoked.',
    example: mockApiKeyResponse(),
    'x-tags': schemaTags('data', 'service-accounts', 'cella'),
  });

/** Returned once, at creation or roll: the only time the plaintext key exists outside the caller. */
export const createdApiKeySchema = apiKeySchema
  .extend({ secret: z.string().describe('The plaintext API key; store it now, it is not shown again.') })
  .openapi({ description: 'A newly created API key with its full secret, returned this once only.', example: mockCreatedApiKeyResponse() });

const apiKeyInputSchema = z.object({
  name: validNameSchema,
  /** Mask over the account's bindings. Omitted or null = every scope the bindings allow. */
  scopes: z.array(scopeEnum).min(1).nullable().optional(),
  expiresAt: z.string().datetime().optional(),
});

export const createApiKeyBodySchema = apiKeyInputSchema.extend({
  /** Roll: issue this key as the successor of an existing one, which keeps working for `rollOverlapDays`. */
  rollFrom: validIdSchema.optional(),
  /** Days the rolled key stays valid, long enough to deploy the successor; Stripe's default is the same week. */
  rollOverlapDays: z.number().int().min(0).max(30).default(7),
});

export const createServiceAccountBodySchema = z.object({
  name: validNameSchema,
  /** Organization role of the account; capped at the creator's own role. */
  role: z.enum(organizationRoles),
  /** One-step "create API key": the first key is issued together with the account. */
  key: apiKeyInputSchema.optional(),
});

export const updateServiceAccountBodySchema = z.object({ name: validNameSchema.optional(), status: z.enum(serviceAccountStatuses).optional() });

export const createServiceAccountResponseSchema = z.object({ serviceAccount: serviceAccountSchema, apiKey: createdApiKeySchema.optional() });

export const apiKeysResponseSchema = z.object({ items: z.array(apiKeySchema) });

export const serviceAccountListQuerySchema = paginationQuerySchema.pick({ q: true, offset: true, limit: true });

export type CreateServiceAccountInput = z.infer<typeof createServiceAccountBodySchema>;
export type UpdateServiceAccountInput = z.infer<typeof updateServiceAccountBodySchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeyBodySchema>;
export type ServiceAccountListQuery = z.infer<typeof serviceAccountListQuerySchema>;
