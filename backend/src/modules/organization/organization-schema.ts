import { z } from '@hono/zod-openapi';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { appConfig, type EntityType, recordFromKeys } from 'shared';
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
  validTempIdSchema,
  validUrlSchema,
} from '#/schemas';
import { mockOrganizationResponse } from '../../../mocks/mock-organization';

// TODO these count schemas should eprahps go to src/schemas because they are used in multiple modules
// Entity count schema should exclude 'user' and 'organization'
type FilteredEntityType = Exclude<EntityType, 'user' | 'organization'>;

const isFilteredEntityType = (entityType: EntityType): entityType is FilteredEntityType => {
  return entityType !== 'user' && entityType !== 'organization';
};

const entityCountSchema = z.object(
  recordFromKeys(appConfig.entityTypes.filter(isFilteredEntityType), () => z.number()),
);

export const membershipCountSchema = z.object({
  ...recordFromKeys(appConfig.entityRoles, () => z.number()),
  pending: z.number(),
  total: z.number(),
});

export const fullCountsSchema = z.object({ membership: membershipCountSchema, entities: entityCountSchema });

/** Schema for optional included data (requested via include query param) */
export const organizationIncludedSchema = z
  .object({
    membership: membershipBaseSchema.optional(),
    counts: fullCountsSchema.optional(),
  })
  .openapi('OrganizationIncluded');

export const organizationSchema = z
  .object({
    ...createSelectSchema(organizationsTable).omit({ restrictions: true }).shape,
    languages: z.array(languageSchema).min(1),
    emailDomains: z.array(z.string()),
    authStrategies: z.array(z.enum(authStrategiesEnum)),
    included: organizationIncludedSchema.optional(),
    can: entityCanSchema.optional(),
  })
  .openapi('Organization', { example: mockOrganizationResponse() });

export const organizationWithMembershipSchema = organizationSchema.extend({
  included: organizationIncludedSchema.extend({ membership: membershipBaseSchema }),
});

const organizationCreateItemSchema = z.object({
  id: validTempIdSchema,
  name: validNameSchema,
  slug: validSlugSchema,
});

/** Array schema for batch creates - rejects duplicate slugs */
export const organizationCreateBodySchema = organizationCreateItemSchema
  .array()
  .min(1)
  .max(10)
  .refine((items) => new Set(items.map((i) => i.slug)).size === items.length, {
    message: 'Duplicate slugs are not allowed',
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
  role: z.enum(appConfig.entityRoles).optional(),
  // TODO make common schema
  excludeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
  include: includeQuerySchema,
});
