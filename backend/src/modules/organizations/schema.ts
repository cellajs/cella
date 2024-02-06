import { z } from '@hono/zod-openapi';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';

import { membershipsTable, organizationsTable } from '../../db/schema';
import { idSchema, slugSchema } from '../../schemas/common';
import { apiUserSchema } from '../users/schema';

export const membershipSchema = createSelectSchema(membershipsTable);

export const apiOrganizationUserSchema = z.object({
  ...apiUserSchema.shape,
  organizationRole: membershipSchema.shape.role.openapi({
    description: 'The role of the user in the organization',
  }),
});

export type ApiOrganizationUser = z.infer<typeof apiOrganizationUserSchema>;

export const apiOrganizationSchema = z.object({
  ...createSelectSchema(organizationsTable).shape,
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
  languages: z.array(z.string()).nullable(),
  emailDomains: z.array(z.string()).nullable(),
  authStrategies: z.array(z.string()).nullable(),
  userRole: membershipSchema.shape.role.nullable().openapi({
    description: 'The role of the current user in the organization',
  }),
  counts: z.object({
    admins: z.number(),
    members: z.number(),
  }),
});
// .extend({
//   createdAt: z.string(),
//   modifiedAt: z.string().nullable(),
//   languages: z.array(z.string()).nullable(),
//   emailDomains: z.array(z.string()).nullable(),
//   authStrategies: z.array(z.string()).nullable(),
//   userRole: membershipSchema.shape.role.openapi({
//     description: 'The role of the current user in the organization',
//   }),
// });

export type ApiOrganization = z.infer<typeof apiOrganizationSchema>;

export const createOrganizationJsonSchema = z.object({
  name: apiOrganizationSchema.shape.name,
});

export const updateOrganizationJsonSchema = createInsertSchema(organizationsTable, {
  languages: z.array(z.string()).optional(),
  emailDomains: z.array(z.string()).optional(),
  authStrategies: z.array(z.string()).optional(),
})
  .pick({
    slug: true,
    name: true,
    shortName: true,
    country: true,
    timezone: true,
    defaultLanguage: true,
    languages: true,
    notificationEmail: true,
    emailDomains: true,
    brandColor: true,
    thumbnailUrl: true,
    logoUrl: true,
    bannerUrl: true,
    websiteUrl: true,
    welcomeText: true,
    authStrategies: true,
    chatSupport: true,
  })
  .partial();

export const getOrganizationParamSchema = z.object({
  organizationIdentifier: slugSchema.or(idSchema),
});

export const updateOrganizationParamSchema = z.object({
  organizationIdentifier: slugSchema.or(idSchema),
});

export const getUsersByOrganizationIdParamSchema = z.object({
  organizationIdentifier: slugSchema.or(idSchema),
});

export const deleteOrganizationParamSchema = z.object({
  organizationIdentifier: slugSchema.or(idSchema),
});

export const updateUserInOrganizationParamSchema = z.object({
  organizationIdentifier: slugSchema.or(idSchema),
  userId: idSchema,
});

export const deleteUserFromOrganizationParamSchema = z.object({
  organizationIdentifier: slugSchema.or(idSchema),
  userId: idSchema,
});

export const updateUserInOrganizationJsonSchema = z.object({
  role: membershipSchema.shape.role.openapi({
    description: 'The role of the user in the organization',
  }),
});

export const userMenuSchema = z.object({
  organizations: z.object({
    active: z.array(apiOrganizationSchema),
    inactive: z.array(apiOrganizationSchema),
    canCreate: z.boolean(),
  }),
});
