import { z } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { passkeySchema } from '#/modules/auth/passkeys/passkeys-schema';
import { sessionsTable } from '#/modules/auth/sessions/sessions-db';
import { federationRefSchema } from '#/modules/auth/sso/sso-schema';
import { mockConnectedApp, mockMeAuthResponse, mockMeResponse, mockUploadTokenResponse } from '#/modules/me/me-mocks';
import { inactiveMembershipSchema } from '#/modules/memberships/memberships-schema';
import { enabledOAuthProvidersSchema, userFlagsSchema, userSchema, userUpdateBodySchema } from '#/modules/user/user-schema';
import { validIdSchema, validUuidSchema } from '#/schemas';
import { channelBaseSchema } from '#/schemas/entity-base';

/** A session row as stored, secret and revoker omitted: what a revoke returns. */
export const sessionBaseSchema = createSelectSchema(sessionsTable).omit({ revokedBy: true });

/** A session as the account page lists it. */
const sessionSchema = sessionBaseSchema.extend({
  isCurrent: z.boolean(),
  isNewDevice: z.boolean().openapi({ description: 'The browser was first seen recently and is not the first one known.' }),
});

export const meSchema = z
  .object({
    user: userSchema,
    isSystemAdmin: z
      .boolean()
      .openapi({ description: 'Whether the user holds the system admin role and the request comes from an allowed IP address.' }),
  })
  .openapi('Me', {
    description: 'The signed-in user, with whether they have system admin access on this request. A client reads it to learn who is signed in.',
    example: mockMeResponse(),
    'x-tags': schemaTags('data', 'me', 'cella'),
  });

/** When a sign-in method was added, and when it last signed the user in. */
const methodDatesShape = {
  createdAt: z.string(),
  lastUsedAt: z.union([z.string(), z.null()]),
};

/** An external identity the account holds, with the address its issuer asserted last. */
const identityShape = { email: z.union([z.string(), z.null()]), ...methodDatesShape };

/** An institution a member could sign in through: the active connection of a tenant they belong to. */
const institutionAccountSchema = z.object({
  connectionId: z.string(),
  displayName: z.string(),
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
    'x-tags': schemaTags('data', 'me', 'cella'),
  });

export const uploadTokenSchema = z
  .object({
    publicBucket: z.boolean().openapi({ description: 'Whether the upload is stored public-read in the public bucket; the template decides.' }),
    sub: z.string(),
    s3: z.boolean(),
    signature: z.string().nullable(),
    params: z
      .object({ auth: z.object({ key: z.string(), expires: z.string().optional() }) })
      .catchall(z.any())
      .nullable(),
  })
  .openapi('UploadToken', {
    description:
      'Permission to upload files with one upload template, signed for the upload service, with the storage prefix the files land under. A client requests one before uploading; the template decides whether files are stored public or private.',
    example: mockUploadTokenResponse(),
    'x-tags': schemaTags('data', 'me', 'cella'),
  });

export const uploadTokenQuerySchema = z.object({ organizationId: validUuidSchema.optional(), templateId: z.enum(appConfig.uploadTemplateIds) });

export const updateMeBodySchema = userUpdateBodySchema.extend({ userFlags: userFlagsSchema.partial().optional() });

export const toggleMfaBodySchema = z.object({ mfaRequired: z.boolean() });

/** The path of one of the caller's pending invitations, named by its own id. */
export const myInvitationParamSchema = z.object({ invitationId: validIdSchema });

export const mePendingInvitationSchema = z.object({
  entity: channelBaseSchema,
  inactiveMembership: inactiveMembershipSchema,
  organizationName: z
    .string()
    .nullable()
    .openapi({ description: 'The name of the organization the channel is in; null for an invitation to an organization.' }),
});

/** A consent the user gave to an OAuth client, as the account page lists it. */
/** The path of one connected app, named by its grant id. */
export const connectedAppParamSchema = z.object({ connectedAppId: validIdSchema });

export const connectedAppSchema = z
  .object({
    id: z.string(),
    clientId: z.string(),
    clientName: z.string(),
    scopes: z.array(z.string()),
    resources: z.array(z.string()),
    createdAt: z.string(),
    expiresAt: z.string().nullable(),
  })
  .openapi({
    description:
      'An app the signed-in user consented to: its OAuth client, the scopes it may use and when the consent expires. Listed under Connected apps in account settings, where the user can revoke it.',
    example: mockConnectedApp(),
  });

export type ConnectedApp = z.infer<typeof connectedAppSchema>;
export type UpdateMeInput = z.infer<typeof updateMeBodySchema>;
