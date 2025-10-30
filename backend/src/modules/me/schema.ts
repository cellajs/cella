import { z } from '@hono/zod-openapi';
import { appConfig, type ContextEntityType } from 'config';
import { createSelectSchema } from 'drizzle-zod';
import { sessionsTable } from '#/db/schema/sessions';
import { passkeySchema, webAuthnAssertionSchema } from '#/modules/auth/passkeys/schema';
import { totpCreateBodySchema } from '#/modules/auth/totps/schema';
import { contextEntityWithMembershipSchema } from '#/modules/entities/schema';
import { enabledOAuthProvidersEnum } from '#/modules/users/schema';
import { booleanTransformSchema } from '#/utils/schema/common';
import { contextEntityBaseSchema } from '../entities/schema-base';
import { userBaseSchema } from '../users/schema-base';
import { inactiveMembershipSchema } from '../memberships/schema';

export const sessionSchema = createSelectSchema(sessionsTable).omit({ token: true }).extend({ isCurrent: z.boolean() });

export const meAuthDataSchema = z.object({
  enabledOAuth: z.array(enabledOAuthProvidersEnum),
  hasTotp: z.boolean(),
  hasPassword: z.boolean(),
  sessions: z.array(sessionSchema.extend({ expiresAt: z.string() })),
  passkeys: z.array(passkeySchema),
});

const menuSectionSchema = z.array(
  z.object({
    ...contextEntityWithMembershipSchema.shape,
    submenu: z.array(contextEntityWithMembershipSchema).optional(),
  }),
);

export const menuSchema = z
  .object(
    appConfig.menuStructure.reduce(
      (acc, { entityType }) => {
        acc[entityType] = menuSectionSchema;
        return acc;
      },
      {} as Record<ContextEntityType, typeof menuSectionSchema>,
    ),
  )
  .openapi('Menu');

export const uploadTokenSchema = z.object({
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
});

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
  inactiveMembership: inactiveMembershipSchema.nullable(),
  createdByUser: userBaseSchema.nullable(),
});
