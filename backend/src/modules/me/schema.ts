import { z } from '@hono/zod-openapi';
import { appConfig, type ContextEntityType } from 'config';
import { createSelectSchema } from 'drizzle-zod';
import { sessionsTable } from '#/db/schema/sessions';
import { contextEntityBaseSchema, contextEntityWithMembershipSchema, userBaseSchema } from '#/modules/entities/schema';
import { membershipBaseSchema } from '#/modules/memberships/schema';
import { enabledOAuthProvidersEnum } from '#/modules/users/schema';
import { booleanTransformSchema } from '#/utils/schema/common';
import { passkeySchema, webAuthnAssertionSchema } from '../auth/passkeys/schema';
import { totpCreateBodySchema } from '../auth/totps/schema';

export const sessionSchema = createSelectSchema(sessionsTable).omit({ token: true }).extend({ isCurrent: z.boolean() });

export const meAuthDataSchema = z.object({
  enabledOAuth: z.array(enabledOAuthProvidersEnum),
  hasTotp: z.boolean(),
  hasPassword: z.boolean(),
  sessions: z.array(sessionSchema.extend({ expiresAt: z.string() })),
  passkeys: z.array(passkeySchema),
});

export const menuItemSchema = contextEntityWithMembershipSchema.omit({ bannerUrl: true }).extend({
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
  organizationId: membershipBaseSchema.shape.organizationId.optional(),
});

const menuSectionSchema = z.array(
  z.object({
    ...menuItemSchema.shape,
    submenu: z.array(menuItemSchema).optional(),
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
  .openapi('MenuSchema');

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

export const meInvitationsSchema = z.array(
  z.object({
    entity: contextEntityBaseSchema.extend({ organizationId: z.string().optional() }),
    invitedBy: userBaseSchema.nullable(),
    membership: membershipBaseSchema,
  }),
);
