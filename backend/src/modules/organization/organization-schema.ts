import { z } from '@hono/zod-openapi';
import { t } from 'i18next';
import { appConfig, type OrganizationFlags, roles } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { evolutionContract } from '#/core/schema-evolution/evolution-contract';
import { createInsertSchema, createSelectSchema } from '#/db/utils/drizzle-schema';
import { membershipBaseSchema } from '#/modules/memberships/memberships-schema';
import { organizationsTable } from '#/modules/organization/organization-db';
import { setupConfigSchema } from '#/modules/organization/setup-config-schema';
import {
  excludeArchivedQuerySchema,
  includeQuerySchema,
  languageSchema,
  maxLength,
  noDuplicateSlugsRefine,
  paginationQuerySchema,
  validCDNUrlSchema,
  validIdSchema,
  validNameSchema,
  validSlugSchema,
  validTempIdSchema,
  validUrlSchema,
} from '#/schemas';
import { channelIncludedSchema } from '#/schemas/channel-included';
import { nullableUserMinimalBaseSchema } from '#/schemas/user-minimal-base';
import { mockOrganizationResponse } from './organization-mocks';

const organizationIncludedSchema = channelIncludedSchema('organization');

/** Flag keys come from the app-owned config, so the wire contract stays strictly typed per app.
 *  Built loose then cast: with zero flags (cella default) `keyof OrganizationFlags` is `never`. */
export const organizationFlagsSchema = z.object(
  Object.keys(appConfig.defaultOrganizationFlags).reduce(
    (acc, key) => {
      acc[key] = z.boolean();
      return acc;
    },
    {} as Record<string, z.ZodBoolean>,
  ) as { [K in keyof OrganizationFlags]: z.ZodBoolean },
);

export const organizationSchema = z
  .object({
    ...createSelectSchema(organizationsTable).shape,
    createdBy: nullableUserMinimalBaseSchema,
    updatedBy: nullableUserMinimalBaseSchema,
    languages: z.array(languageSchema).min(1),
    organizationFlags: organizationFlagsSchema,
    setupConfig: setupConfigSchema,
    included: organizationIncludedSchema,
  })
  .openapi('Organization', {
    description: 'The main channel entity is an organization.',
    example: mockOrganizationResponse(),
    'x-tags': schemaTags('data', 'organizations', 'cella'),
  });

export const organizationWithMembershipSchema = organizationSchema.extend({
  included: organizationIncludedSchema.extend({ membership: membershipBaseSchema }),
});

/** Wire registration: lens-widened schemas + entity-bound runtime seam for organization */
export const organizationContract = evolutionContract.channel('organization', {
  createItem: z.object({
    id: validTempIdSchema,
    name: validNameSchema,
    slug: validSlugSchema,
  }),
  updateBody: createInsertSchema(organizationsTable, {
    slug: validSlugSchema,
    name: validNameSchema,
    shortName: validNameSchema.nullable(),
    languages: z.array(languageSchema).min(1),
    defaultLanguage: languageSchema.optional(),
    websiteUrl: validUrlSchema.nullable(),
    thumbnailUrl: validCDNUrlSchema.nullable(),
    bannerUrl: validCDNUrlSchema.nullable(),
    logoUrl: validCDNUrlSchema.nullable(),
    welcomeText: z.string().max(maxLength.html).nullable(),
    // Partial per key: a single flag can be toggled; the update query merges via jsonb ||
    organizationFlags: organizationFlagsSchema.partial(),
    // setupConfig merges via jsonb || on update, mirroring organizationFlags
    setupConfig: setupConfigSchema.partial(),
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
      color: true,
      thumbnailUrl: true,
      logoUrl: true,
      bannerUrl: true,
      websiteUrl: true,
      welcomeText: true,
      chatSupport: true,
      organizationFlags: true,
      setupConfig: true,
    })
    .partial(),
});

/** Array schema for batch creates - rejects duplicate slugs */
export const organizationCreateBodySchema = organizationContract.createItemSchema
  .array()
  .min(1)
  .max(10)
  .refine(noDuplicateSlugsRefine, t('error:duplicate_slugs'));

export const organizationUpdateBodySchema = organizationContract.updateBodySchema;

export const organizationListQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['id', 'name', 'createdAt', 'displayOrder']).default('displayOrder'),
  order: z.enum(['asc', 'desc']).default('asc'),
  relatableUserId: validIdSchema.optional(),
  role: z.enum(roles.all).optional(),
  excludeArchived: excludeArchivedQuerySchema,
  include: includeQuerySchema,
});
