import { z } from '@hono/zod-openapi';
import { appConfig, type OrganizationFlags, roles } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { evolutionContract } from '#/core/schema-evolution/evolution-contract';
import { createInsertSchema, createSelectSchema } from '#/db/utils/drizzle-schema';
import { membershipBaseSchema } from '#/modules/memberships/memberships-schema';
import { organizationsTable } from '#/modules/organization/organization-db';
import {
  excludeArchivedQuerySchema,
  includeQuerySchema,
  languageSchema,
  maxLength,
  noDuplicateSlugsRefine,
  paginationQuerySchema,
  translatedError,
  validCDNUrlSchema,
  validNameSchema,
  validSlugSchema,
  validTempIdSchema,
  validUrlSchema,
  validUuidSchema,
} from '#/schemas';
import { setupConfigSchema } from '#/schemas/app-schemas';
import { channelIncludedSchema } from '#/schemas/channel-included';
import { auditShape } from '#/schemas/entity-base';
import { toolsConfigSchema } from '#/schemas/tools-config';
import { mockOrganizationResponse } from './organization-mocks';

const organizationIncludedSchema = channelIncludedSchema('organization');

/** Flag keys come from the app-owned config; built loose then cast because with zero flags `keyof OrganizationFlags` is `never`. */
const organizationFlagsSchema = z.object(
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
    ...auditShape,
    languages: z.array(languageSchema).min(1),
    organizationFlags: organizationFlagsSchema,
    setupConfig: setupConfigSchema,
    toolsConfig: toolsConfigSchema,
    included: organizationIncludedSchema,
  })
  .openapi('Organization', {
    description:
      "The channel entity every other channel nests under, owning memberships and roles. Tenant and organization are 1:1: an organization belongs to one tenant, and that tenant holds no other. Returned with `included` data: the signed-in user's membership, counts and member previews.",
    example: mockOrganizationResponse(),
    'x-tags': schemaTags('data', 'organizations', 'cella'),
  });

export const organizationWithMembershipSchema = organizationSchema.extend({
  included: organizationIncludedSchema.extend({ membership: membershipBaseSchema }),
});

/** Wire registration: lens-widened schemas bound to the organization entity at runtime. */
export const organizationContract = evolutionContract.channel('organization', {
  createItem: z.object({
    id: validTempIdSchema,
    name: validNameSchema,
    slug: validSlugSchema,
    draft: z.boolean().optional().openapi({
      description:
        'Create unpublished: only its prepare roles are invited until it is published. Ignored unless the hierarchy declares `drafts` for organizations.',
    }),
  }),
  updateBody: createInsertSchema(organizationsTable, {
    slug: validSlugSchema,
    name: validNameSchema,
    shortName: validNameSchema.nullable(),
    languages: z.array(languageSchema).min(1).max(64),
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
    // toolsConfig merges via jsonb || on update: each listed slot key is replaced wholesale
    toolsConfig: toolsConfigSchema,
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
      toolsConfig: true,
    })
    .partial(),
});

export const organizationPublishResponseSchema = z.object({
  organization: organizationSchema,
  invitationsSent: z.number().int().min(0).openapi({ description: 'Invitations held while it was a draft and sent now.' }),
});

/** Array schema for batch creates - rejects duplicate slugs */
export const organizationCreateBodySchema = organizationContract.createItemSchema
  .array()
  .min(1)
  .max(10)
  .refine(noDuplicateSlugsRefine, translatedError('error:duplicate_slugs'));

export const organizationUpdateBodySchema = organizationContract.updateBodySchema;

export const organizationListQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['id', 'name', 'createdAt', 'displayOrder']).default('displayOrder'),
  order: z.enum(['asc', 'desc']).default('asc'),
  relatableUserId: validUuidSchema.optional(),
  role: z.enum(roles.all).optional(),
  excludeArchived: excludeArchivedQuerySchema,
  include: includeQuerySchema,
});
