import { config, type EntityType } from 'config';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { organizationsTable } from '#/db/schema/organizations';
import { membershipSummarySchema } from '#/modules/memberships/schema';
import {
  languageSchema,
  paginationQuerySchema,
  validDomainsSchema,
  validImageKeySchema,
  validNameSchema,
  validSlugSchema,
  validUrlSchema,
} from '#/utils/schema/common';

// Entity count schema should exclude 'user' and 'organization'
type FilteredEntityType = Exclude<EntityType, 'user' | 'organization'>;

const isFilteredEntityType = (entityType: EntityType): entityType is FilteredEntityType => {
  return entityType !== 'user' && entityType !== 'organization';
};

const entityCountSchema = z.object(
  Object.fromEntries(Object.entries(config.entityTypes.filter(isFilteredEntityType)).map(([entityType]) => [entityType, z.number()])) as Record<
    FilteredEntityType,
    z.ZodNumber
  >,
);

export const membershipCountSchema = z.object({
  admin: z.number(),
  member: z.number(),
  pending: z.number(),
  total: z.number(),
});

export const fullCountsSchema = z.object({ membership: membershipCountSchema, related: entityCountSchema });

export const organizationSchema = z.object({
  ...createSelectSchema(organizationsTable).shape,
  languages: z.array(languageSchema).min(1),
  emailDomains: z.array(z.string()),
  authStrategies: z.array(z.string()),
  membership: membershipSummarySchema.nullable(),
  invitesCount: z.number(),
});

export const organizationWithMembershipSchema = organizationSchema.extend({ membership: membershipSummarySchema });

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
  authStrategies: z.array(z.string()).optional(),
  websiteUrl: validUrlSchema.nullable(),
  thumbnailUrl: validImageKeySchema.nullable(),
  bannerUrl: validImageKeySchema.nullable(),
  logoUrl: validImageKeySchema.nullable(),
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

export const organizationListQuerySchema = paginationQuerySchema.merge(
  z.object({
    sort: z.enum(['id', 'name', 'userRole', 'createdAt']).default('createdAt').optional(),
  }),
);
