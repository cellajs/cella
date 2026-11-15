import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { mockMeAuthResponse } from '#/modules/auth/auth-mocks';
import { federationRefSchema } from '#/modules/auth/core/federations/federations-schema';
import { sessionsTable } from '#/modules/auth/core/sessions/sessions-db';
import { passkeySchema } from '#/modules/auth/flows/passkeys/passkeys-schema';
import { enabledOAuthProvidersSchema } from '#/modules/user/user-schema';
import { userIdParamSchema } from '#/schemas';

/** A session row as stored, secret and revoker omitted: what a revoke returns. */
export const sessionBaseSchema = createSelectSchema(sessionsTable).omit({ revokedBy: true });

/** A session as the account page lists it. */
const sessionSchema = sessionBaseSchema.extend({
  current: z.boolean(),
  newDevice: z.boolean().openapi({ description: 'The browser was first seen recently and is not the first one known.' }),
});

/** When a sign-in method was added, and when it last signed the user in. */
const methodDatesShape = { createdAt: z.string(), lastUsedAt: z.union([z.string(), z.null()]) };

/** An external identity the account holds, with the address its provider asserted last. */
const identityShape = { email: z.union([z.string(), z.null()]), ...methodDatesShape };

/** An institution a member could sign in through: the active connection of a tenant they belong to. */
const institutionAccountSchema = z.object({
  connectionId: z.string(),
  name: z.string(),
  federation: federationRefSchema,
  identity: z.union([z.object(identityShape), z.null()]).describe('The identity the account holds through this connection; null when not connected'),
});

export const meAuthDataSchema = z
  .object({
    oauthIdentities: z.array(z.object({ provider: enabledOAuthProvidersSchema, ...identityShape })),
    institutions: z.array(institutionAccountSchema),
    totp: z
      .union([z.object(methodDatesShape), z.null()])
      .describe('Null without TOTP. Its last use is the start of the time step of the newest code it accepted.'),
    sessions: z.array(sessionSchema),
    passkeys: z.array(passkeySchema),
  })
  .openapi('MeAuthData', {
    description:
      'How the signed-in user signs in: connected OAuth identities, the institutions of their organizations (connected or not), passkeys, TOTP, and their live sessions, with when each method was added and last used. The account page lists it, where sessions can be ended and sign-in methods changed.',
    example: mockMeAuthResponse(),
    'x-tags': schemaTags('data', 'auth', 'cella'),
  });

export const toggleMfaBodySchema = z.object({ mfaRequired: z.boolean() });

/** What an administrator's sign-out of a user did. */
export const sessionsRevokedSchema = z.object({ revoked: z.number().describe('Sessions ended') });

/** The factor an administrator removes from another account: every passkey, or the authenticator app. */
export const recoverableFactorParamSchema = userIdParamSchema.extend({ factor: z.enum(['passkey', 'totp']) });

/** What an administrator's removal of a lost factor did. */
export const factorRemovedSchema = z.object({
  removed: z.number().describe('Passkeys removed, or 1 for the authenticator app'),
  mfaDisabled: z.boolean().describe('Whether MFA turned off because a required method is gone'),
});
