import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';
import { createSelectSchema } from 'drizzle-zod';
import { sessionsTable } from '#/db/schema/sessions';
import { passkeySchema, webAuthnAssertionSchema } from '#/modules/auth/passkeys/passkeys-schema';
import { totpCreateBodySchema } from '#/modules/auth/totps/totps-schema';
import { contextEntityBaseSchema } from '#/modules/entities/entities-schema-base';
import { inactiveMembershipSchema } from '#/modules/memberships/memberships-schema';
import { enabledOAuthProvidersEnum, userSchema } from '#/modules/user/user-schema';
import { booleanTransformSchema } from '#/schemas';
import { mockMeAuthDataResponse, mockMeResponse, mockUploadTokenResponse } from '../../../mocks/mock-me';

export const sessionSchema = createSelectSchema(sessionsTable).omit({ token: true }).extend({ isCurrent: z.boolean() });

export const meSchema = z
  .object({
    user: userSchema,
    systemRole: z.enum([...appConfig.roles.systemRoles, 'user']).openapi({ description: 'Explain system role here' }),
  })
  .openapi('Me', { example: mockMeResponse() });

export const meAuthDataSchema = z
  .object({
    enabledOAuth: z.array(enabledOAuthProvidersEnum),
    hasTotp: z.boolean(),
    hasPassword: z.boolean(),
    sessions: z.array(sessionSchema.extend({ expiresAt: z.string() })),
    passkeys: z.array(passkeySchema),
  })
  .openapi('MeAuthData', { example: mockMeAuthDataResponse() });

export const uploadTokenSchema = z
  .object({
    public: z.boolean(),
    sub: z.string(),
    s3: z.boolean(),
    signature: z.string(),
    params: z
      .object({
        auth: z.object({
          key: z.string(),
          expires: z.string().optional(),
        }),
        // Allow additional arbitrary keys with any type in params
      })
      .catchall(z.any()),
  })
  .openapi('UploadToken', { example: mockUploadTokenResponse() });

// Re-export types from types.ts for convenience
export type { MeAuthDataResponse, MeResponse, UploadTokenResponse } from './types';

export const uploadTokenQuerySchema = z.object({
  public: booleanTransformSchema,
  organizationId: z.string().optional(),
  templateId: z.enum(appConfig.uploadTemplateIds),
});

export const toggleMfaBodySchema = z.object({
  passkeyData: webAuthnAssertionSchema.optional(),
  totpCode: totpCreateBodySchema.shape.code.optional(),
  mfaRequired: z.boolean(),
});

export const mePendingInvitationSchema = z.object({
  entity: contextEntityBaseSchema,
  inactiveMembership: inactiveMembershipSchema,
});
