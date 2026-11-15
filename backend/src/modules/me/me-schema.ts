import { z } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { sessionBaseSchema } from '#/modules/auth/core';
import { mockConnectedApp, mockMeResponse, mockUploadTokenResponse } from '#/modules/me/me-mocks';
import { inviteeInvitationSchema } from '#/modules/memberships/memberships-schema';
import { userFlagsSchema, userSchema, userUpdateBodySchema } from '#/modules/user/user-schema';
import { validIdSchema, validUuidSchema } from '#/schemas';
import { channelBaseSchema } from '#/schemas/entity-base';
import { mergePatchSchema } from '#/schemas/merge-patch-schema';

export const meSchema = z
  .object({
    user: userSchema,
    isSystemAdmin: z
      .boolean()
      .openapi({ description: 'Whether the user holds the system admin role and the request comes from an allowed IP address.' }),
    session: sessionBaseSchema
      .pick({ id: true, expiresAt: true })
      .openapi({ description: 'The session this request presents: its id, and when it ends unless revoked first.' }),
  })
  .openapi('Me', {
    description:
      'The signed-in user, with whether they have system admin access on this request and the session it presents. A client reads it to learn who is signed in.',
    example: mockMeResponse(),
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

export const updateMeBodySchema = userUpdateBodySchema.extend({ userFlags: mergePatchSchema(userFlagsSchema).optional() });

/** The path of one of the caller's pending invitations, named by its own id. */
export const myInvitationParamSchema = z.object({ invitationId: validIdSchema });

export const mePendingInvitationSchema = z.object({
  entity: channelBaseSchema,
  invitation: inviteeInvitationSchema,
  organizationName: z
    .string()
    .nullable()
    .openapi({ description: 'The name of the organization the channel is in; null for an invitation to an organization.' }),
});

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
