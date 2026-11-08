import { z } from '@hono/zod-openapi';
import { appConfig, type ChannelEntityType } from 'shared';
import { validIdSchema, validSlugSchema } from '#/schemas';

export const checkSlugBodySchema = z.object({ slug: validSlugSchema, entityType: z.enum(appConfig.channelEntityTypes) });

const channelTypesBelowOrganization = appConfig.channelEntityTypes.filter(
  (channelType): channelType is Exclude<ChannelEntityType, 'organization'> => channelType !== 'organization',
);

/** The channel an archive or unarchive acts on: never the organization, whose tenant archives. */
export const channelArchiveBodySchema = z.object({
  channelType: z.enum(channelTypesBelowOrganization),
  channelId: validIdSchema,
  includeDescendants: z
    .boolean()
    .optional()
    .openapi({ description: 'Also changes the channels inside it that the caller may update. Off by default.' }),
});

/** View count from product counters, present on product reads that join or fetch them. */
export const productViewCountSchema = z.number().int().min(0).optional();
