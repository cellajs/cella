import { z } from '@hono/zod-openapi';
import { appConfig, recordFromKeys, roles, typedEntries } from 'shared';
import { schemaTags } from '#/core/openapi-helpers';
import { evolutionContract } from '#/core/schema-evolution/evolution-contract';
import { createInsertSchema, createSelectSchema } from '#/db/utils/drizzle-schema';
import { membershipBaseSchema } from '#/modules/memberships/memberships-schema';
import { organizationsTable } from '#/modules/organization/organization-db';
import { mockOrganizationResponse } from '#/modules/organization/organization-mocks';
import { tenantKindsQuerySchema } from '#/modules/tenants/tenants-schema';
import {
  booleanTransformSchema,
  includeQuerySchema,
  languageSchema,
  listQuerySchema,
  maxLength,
  noDuplicateSlugsRefine,
  orderByQuerySchema,
  regionCodeSchema,
  timeZoneSchema,
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
import { mergePatchSchema } from '#/schemas/merge-patch-schema';
import { toolsConfigSchema } from '#/schemas/tools-config';

const organizationIncludedSchema = channelIncludedSchema('organization');

/** Flag keys come from the app-owned config. */
const organizationFlagKeys = typedEntries(appConfig.defaultOrganizationFlags).map(([key]) => key);
const organizationFlagsSchema = z.object(recordFromKeys(organizationFlagKeys, () => z.boolean()));

export const organizationSchema = z
  .object({
    ...createSelectSchema(organizationsTable).shape,
    ...auditShape,
    languageCodes: z.array(languageSchema).min(1),
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
    regionCode: regionCodeSchema.nullable(),
    timeZone: timeZoneSchema.nullable(),
    languageCodes: z.array(languageSchema).min(1).max(64),
    defaultLanguageCode: languageSchema.optional(),
    websiteUrl: validUrlSchema.nullable(),
    thumbnailUrl: validCDNUrlSchema.nullable(),
    bannerUrl: validCDNUrlSchema.nullable(),
    welcomeText: z.string().max(maxLength.html).nullable(),
    organizationFlags: mergePatchSchema(organizationFlagsSchema),
    setupConfig: mergePatchSchema(setupConfigSchema),
    toolsConfig: mergePatchSchema(toolsConfigSchema),
  })
    .pick({
      slug: true,
      name: true,
      shortName: true,
      regionCode: true,
      timeZone: true,
      defaultLanguageCode: true,
      languageCodes: true,
      notificationEmail: true,
      color: true,
      thumbnailUrl: true,
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
  invitationCount: z.number().int().min(0).openapi({ description: 'Invitations held while it was a draft and sent now.' }),
});

/** Array schema for batch creates - rejects duplicate slugs */
export const organizationCreateBodySchema = organizationContract.createItemSchema
  .array()
  .min(1)
  .max(10)
  .refine(noDuplicateSlugsRefine, translatedError('error:duplicate_slugs'));

export const organizationUpdateBodySchema = organizationContract.updateBodySchema;

export const organizationListQuerySchema = listQuerySchema.extend({
  orderBy: orderByQuerySchema(['id', 'name', 'createdAt', 'displayOrder'], 'displayOrder asc'),
  relatableUserId: validUuidSchema.optional(),
  role: z.enum(roles.all).optional(),
  excludeHidden: booleanTransformSchema,
  include: includeQuerySchema,
  kind: tenantKindsQuerySchema.describe(
    "Tenant kinds a system admin's list across tenants covers, comma-separated; absent covers the kinds the app lists by default. A member's own list ignores it.",
  ),
});
