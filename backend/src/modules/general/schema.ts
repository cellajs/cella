import { z } from 'zod';

import { config } from 'config';
import { createSelectSchema } from 'drizzle-zod';
import { tokensTable } from '#/db/schema/tokens';
import { type MenuSectionName, menuSections } from '#/entity-config';
import {
  contextEntityTypeSchema,
  idOrSlugSchema,
  idSchema,
  imageUrlSchema,
  nameSchema,
  pageEntityTypeSchema,
  paginationQuerySchema,
  passwordSchema,
  slugSchema,
} from '#/utils/schema/common-schemas';
import { menuItemSchema } from '../me/schema';
import { membershipInfoSchema } from '../memberships/schema';
import { userSchema } from '../users/schema';

export const checkTokenSchema = z.object({
  type: createSelectSchema(tokensTable).shape.type,
  email: z.string().email(),
  organizationName: z.string().optional(),
  organizationSlug: z.string().optional(),
});

export const inviteBodySchema = z.object({
  emails: userSchema.shape.email.array().min(1),
  role: z.enum(['user']),
});

export const acceptInviteBodySchema = z.object({
  password: passwordSchema.optional(),
  oauth: z.enum(config.enabledOauthProviders).optional(),
});

const sectionNames = menuSections.map((section) => section.name) as [MenuSectionName];

export const acceptInviteResponseSchema = z
  .object({
    newItem: menuItemSchema,
    sectionName: z.enum(sectionNames),
  })
  .optional();

export const entitySuggestionSchema = z.object({
  slug: slugSchema,
  id: idSchema,
  name: nameSchema,
  email: z.string().optional(),
  thumbnailUrl: imageUrlSchema.nullable().optional(),
  entity: pageEntityTypeSchema,
  membership: membershipInfoSchema,
});

export type Suggestion = z.infer<typeof entitySuggestionSchema>;

export const suggestionsSchema = z.object({
  items: z.array(entitySuggestionSchema),
  total: z.number(),
});

export const membersSchema = z.object({
  ...userSchema.shape,
  membership: membershipInfoSchema,
});

export const membersQuerySchema = paginationQuerySchema.extend({
  idOrSlug: idOrSlugSchema,
  entityType: contextEntityTypeSchema,
  sort: z.enum(['id', 'name', 'email', 'role', 'createdAt', 'lastSeenAt']).default('createdAt').optional(),
  role: z.enum(config.rolesByType.entityRoles).default('member').optional(),
});
