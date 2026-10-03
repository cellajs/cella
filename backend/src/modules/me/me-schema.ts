import { z } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { passkeySchema } from '#/modules/auth/passkeys/passkeys-schema';
import { sessionsTable } from '#/modules/auth/sessions/sessions-db';
import { inactiveMembershipSchema } from '#/modules/memberships/memberships-schema';
import { enabledOAuthProvidersSchema, userSchema } from '#/modules/user/user-schema';
import { validUuidSchema } from '#/schemas';
import { channelBaseSchema } from '#/schemas/entity-base';
import { userMinimalBaseSchema } from '#/schemas/minimal-base';
import { mockConnectedApp, mockMeAuthResponse, mockMeResponse, mockUploadTokenResponse } from './me-mocks';

/** A session row as stored, secret omitted: what a revoke returns. */
export const sessionBaseSchema = createSelectSchema(sessionsTable);

/** A session as the account page lists it. */
export const sessionSchema = sessionBaseSchema.extend({
  isCurrent: z.boolean(),
  isNewDevice: z.boolean().openapi({ description: 'The browser was first seen recently and is not the first one known.' }),
});

export const meSchema = z
  .object({
    user: userSchema,
    isSystemAdmin: z
      .boolean()
      .openapi({ description: 'Whether the user holds the system admin role and the request comes from an allowed IP address.' }),
    impersonator: z
      .union([userMinimalBaseSchema, z.null()])
      .openapi({ description: "The system admin acting as the user through an impersonation; null on the user's own session." }),
  })
  .openapi('Me', {
    description:
      'The signed-in user, with whether they have system admin access on this request and, in an impersonation, the system admin acting as them. A client reads it to learn who is signed in.',
    example: mockMeResponse(),
    'x-tags': schemaTags('data', 'me', 'cella'),
  });

/** An institution a member could sign in through: the active connection of a tenant they belong to. */
const institutionAccountSchema = z.object({
  connectionId: z.string(),
  displayName: z.string(),
  federation: z.object({ key: z.string(), label: z.string() }),
  connected: z.boolean().describe('Whether the account already holds an identity through this connection'),
});

export const meAuthDataSchema = z
  .object({
    enabledOAuth: z.array(enabledOAuthProvidersSchema),
    institutions: z.array(institutionAccountSchema),
    hasTotp: z.boolean(),
    sessions: z.array(sessionSchema.extend({ expiresAt: z.string() })),
    passkeys: z.array(passkeySchema),
  })
  .openapi('MeAuthData', {
    description:
      'How the signed-in user signs in: connected OAuth providers, the institutions of their organizations (connected or not), passkeys, whether TOTP is set up, and their live sessions. The account page lists it, where sessions can be ended and sign-in methods changed.',
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

export type { MeAuthResponse, MeResponse, UploadTokenResponse } from './types';

export const uploadTokenQuerySchema = z.object({ organizationId: validUuidSchema.optional(), templateId: z.enum(appConfig.uploadTemplateIds) });

export const toggleMfaBodySchema = z.object({ mfaRequired: z.boolean() });

export const mePendingInvitationSchema = z.object({ entity: channelBaseSchema, inactiveMembership: inactiveMembershipSchema });

/** A consent the user gave to an OAuth client, as the account page lists it. */
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
  .openapi('ConnectedApp', {
    description:
      'An app the signed-in user consented to: its OAuth client, the scopes it may use and when the consent expires. Listed under Connected apps in account settings, where the user can revoke it.',
    example: mockConnectedApp(),
    'x-tags': schemaTags('data', 'me', 'cella'),
  });

export type ConnectedApp = z.infer<typeof connectedAppSchema>;
