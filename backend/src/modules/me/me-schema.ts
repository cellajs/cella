import { z } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { passkeySchema, webAuthnAssertionSchema } from '#/modules/auth/passkeys/passkeys-schema';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { totpCreateBodySchema } from '#/modules/auth/totps/totps-schema';
import { inactiveMembershipSchema } from '#/modules/memberships/memberships-schema';
import { enabledOAuthProvidersSchema, userSchema } from '#/modules/user/user-schema';
import { booleanTransformSchema, validUuidSchema } from '#/schemas';
import { channelBaseSchema } from '#/schemas/entity-base';
import { mockMeAuthResponse, mockMeResponse, mockUploadTokenResponse } from './me-mocks';

/** A session row as stored, secret omitted: what a revoke returns. */
export const sessionBaseSchema = createSelectSchema(sessionsTable);

/** A session as the account page lists it. */
export const sessionSchema = sessionBaseSchema.extend({
  isCurrent: z.boolean(),
  isNewDevice: z
    .boolean()
    .openapi({ description: 'The browser was first seen recently and is not the first one known.' }),
});

export const meSchema = z
  .object({
    user: userSchema,
    isSystemAdmin: z.boolean().openapi({ description: 'Whether the current user has system admin privileges.' }),
  })
  .openapi('Me', {
    description: 'The currently authenticated user with their system admin status.',
    example: mockMeResponse(),
    'x-tags': schemaTags('data', 'me', 'cella'),
  });

export const meAuthDataSchema = z
  .object({
    enabledOAuth: z.array(enabledOAuthProvidersSchema),
    hasTotp: z.boolean(),
    sessions: z.array(sessionSchema.extend({ expiresAt: z.string() })),
    passkeys: z.array(passkeySchema),
  })
  .openapi('MeAuthData', {
    description: 'Authentication metadata for the current user session.',
    example: mockMeAuthResponse(),
    'x-tags': schemaTags('data', 'me', 'cella'),
  });

export const uploadTokenSchema = z
  .object({
    publicBucket: z.boolean(),
    sub: z.string(),
    s3: z.boolean(),
    signature: z.string().nullable(),
    params: z
      .object({
        auth: z.object({
          key: z.string(),
          expires: z.string().optional(),
        }),
      })
      .catchall(z.any())
      .nullable(),
  })
  .openapi('UploadToken', {
    description: 'A signed token authorizing file uploads to the configured storage provider.',
    example: mockUploadTokenResponse(),
    'x-tags': schemaTags('data', 'me', 'cella'),
  });

export type { MeAuthResponse, MeResponse, UploadTokenResponse } from './types';

export const uploadTokenQuerySchema = z.object({
  publicBucket: booleanTransformSchema,
  organizationId: validUuidSchema.optional(),
  templateId: z.enum(appConfig.uploadTemplateIds),
});

export const toggleMfaBodySchema = z.object({
  passkeyData: webAuthnAssertionSchema.optional(),
  totpCode: totpCreateBodySchema.shape.code.optional(),
  mfaRequired: z.boolean(),
});

export const mePendingInvitationSchema = z.object({
  entity: channelBaseSchema,
  inactiveMembership: inactiveMembershipSchema,
});

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
    description: 'An OAuth consent (grant) of the current user.',
    'x-tags': schemaTags('data', 'me', 'cella'),
  });

export type ConnectedApp = z.infer<typeof connectedAppSchema>;
