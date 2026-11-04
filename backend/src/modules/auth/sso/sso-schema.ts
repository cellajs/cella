import { z } from '@hono/zod-openapi';
import type { FederationKey } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { mockSsoEntryResponse } from '#/modules/auth/auth-mocks';
import { federationKeys } from '#/modules/auth/sso/helpers/federation-keys';
import { isFederationKey } from '#/modules/auth/sso/helpers/federations';
import { connectionStatuses } from '#/modules/connections/connections-db';
import { maxLength, validIdSchema } from '#/schemas';

/**
 * A federation key of this app's config, bounded before the lookup. With `type` set the docs show the metadata alone: a
 * string and, when the app declares federations, their enum.
 */
export const federationKeySchema = z
  .string()
  .max(maxLength.field)
  .pipe(z.custom<FederationKey>((value) => typeof value === 'string' && isFederationKey(value), { message: 'Unknown federation' }))
  .openapi({ type: 'string', description: 'A federation key in appConfig.federations', ...(federationKeys.length ? { enum: federationKeys } : {}) });

/** A federation as a response names it: its config key and label. */
export const federationRefSchema = z.object({ key: federationKeySchema, label: z.string() });

export const ssoConnectionParamSchema = z.object({ connectionId: validIdSchema });

export const ssoFederationParamSchema = z.object({ federation: z.string().min(1).max(64) });

/** What a tenant's SSO entry page shows before the browser leaves for the federation. */
export const ssoEntrySchema = z
  .object({
    id: z.string(),
    status: z.enum(connectionStatuses).describe('Only `active` signs in; `pending` means the institution has not activated the app yet'),
    federation: federationRefSchema,
    institution: z.object({ displayName: z.string(), logoUrl: z.string().nullable() }),
    organization: z.object({ id: z.string(), name: z.string(), slug: z.string(), thumbnailUrl: z.string().nullable() }).nullable(),
  })
  .openapi('SsoEntry', {
    description:
      "The sign-in entry of one institution at one organization: the federation it goes through, the institution, the organization, and whether it is active. Public by the connection's id, which is the link an institution shares.",
    example: mockSsoEntryResponse(),
    'x-tags': schemaTags('data', 'auth', 'cella'),
  });
