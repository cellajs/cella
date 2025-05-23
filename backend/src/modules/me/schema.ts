import { z } from 'zod';

import { type ContextEntityType, config } from 'config';
import { createSelectSchema } from 'drizzle-zod';
import { sessionsTable } from '#/db/schema/sessions';
import { entityBaseSchema } from '#/modules/entities/schema';
import { membershipSummarySchema } from '#/modules/memberships/schema';
import { enabledOauthProvidersEnum } from '#/modules/users/schema';
import { booleanQuerySchema } from '#/utils/schema/common';

export const sessionSchema = createSelectSchema(sessionsTable).omit({ token: true }).extend({ isCurrent: z.boolean() });

export const meAuthDataSchema = z.object({
  oauth: z.array(enabledOauthProvidersEnum),
  passkey: z.boolean(),
  sessions: z.array(sessionSchema.extend({ expiresAt: z.string() })),
});

export const menuItemSchema = entityBaseSchema.omit({ bannerUrl: true }).extend({
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
  membership: membershipSummarySchema,
  organizationId: membershipSummarySchema.shape.organizationId.optional(),
});

const menuItemListSchema = z.array(
  z.object({
    ...menuItemSchema.shape,
    submenu: z.array(menuItemSchema).optional(),
  }),
);

export const menuSchema = z.object(
  config.menuStructure.reduce(
    (acc, { entityType }) => {
      acc[entityType] = menuItemListSchema;
      return acc;
    },
    {} as Record<ContextEntityType, typeof menuItemListSchema>,
  ),
);

export const passkeyRegistrationBodySchema = z.object({
  userEmail: z.string(),
  attestationObject: z.string(),
  clientDataJSON: z.string(),
});

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
  public: booleanQuerySchema,
  organizationId: z.string().optional(),
  templateId: z.enum(config.uploadTemplateIds),
});
