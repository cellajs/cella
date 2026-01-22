import { z } from '@hono/zod-openapi';
import { appConfig, type EntityType } from 'config';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { organizationsTable } from '#/db/schema/organizations';
import { authStrategiesEnum } from '#/db/schema/sessions';
import { membershipBaseSchema } from '#/modules/memberships/memberships-schema';
import {
  entityCanSchema,
  includeQuerySchema,
  languageSchema,
  paginationQuerySchema,
  validCDNUrlSchema,
  validDomainsSchema,
  validNameSchema,
  validSlugSchema,
  validUrlSchema,
} from '#/utils/schema/common';
import { mockOrganizationResponse } from '../../../mocks/mock-organization';

// Entity count schema should exclude 'user' and 'organization'
type FilteredEntityType = Exclude<EntityType, 'user' | 'organization'>;

const isFilteredEntityType = (entityType: EntityType): entityType is FilteredEntityType => {
  return entityType !== 'user' && entityType !== 'organization';
};

const entityCountSchema = z.object(
  Object.fromEntries(
    appConfig.entityTypes.filter(isFilteredEntityType).map((entityType) => [entityType, z.number()]),
  ) as Record<FilteredEntityType, z.ZodNumber>,
);

export const membershipCountSchema = z.object({
  ...(Object.fromEntries(appConfig.roles.entityRoles.map((role) => [role, z.number()])) as Record<
    (typeof appConfig.roles.entityRoles)[number],
    z.ZodNumber
  >),
  pending: z.number(),
  total: z.number(),
});

export const fullCountsSchema = z.object({ membership: membershipCountSchema, entities: entityCountSchema });

export const organizationSchema = z
  .object({
    ...createSelectSchema(organizationsTable).omit({ restrictions: true }).shape,
    languages: z.array(languageSchema).min(1),
    emailDomains: z.array(z.string()),
    authStrategies: z.array(z.enum(authStrategiesEnum)),
    membership: z.union([membershipBaseSchema, z.null()]),
    counts: fullCountsSchema.optional(),
    can: entityCanSchema.optional(),
  })
  .openapi('Organization', { example: mockOrganizationResponse() });

export const organizationWithMembershipSchema = organizationSchema.extend({ membership: membershipBaseSchema });

export const organizationCreateBodySchema = z.object({
  name: validNameSchema,
  slug: validSlugSchema,
});

export const organizationUpdateBodySchema = createInsertSchema(organizationsTable, {
  slug: validSlugSchema,
  name: validNameSchema,
  shortName: validNameSchema.nullable(),
  languages: z.array(languageSchema).min(1),
  defaultLanguage: languageSchema.optional(),
  emailDomains: validDomainsSchema,
  authStrategies: z.array(z.enum(authStrategiesEnum)).optional(),
  websiteUrl: validUrlSchema.nullable(),
  thumbnailUrl: validCDNUrlSchema.nullable(),
  bannerUrl: validCDNUrlSchema.nullable(),
  logoUrl: validCDNUrlSchema.nullable(),
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
    color: true,
    thumbnailUrl: true,
    logoUrl: true,
    bannerUrl: true,
    websiteUrl: true,
    welcomeText: true,
    authStrategies: true,
    chatSupport: true,
  })
  .partial();

export const organizationListQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['id', 'name', 'createdAt']).default('createdAt').optional(),
  userId: z.string().optional(),
  role: z.enum(appConfig.roles.entityRoles).optional(),
  excludeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
  include: includeQuerySchema,
});
