import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { nullableActorRefSchema } from '#/schemas/actor-ref';
import { channelEntityTypeSchema, productEntityTypeSchema } from '#/schemas/common-schemas';
import { mockChannelBase, mockProductBase } from '#/schemas/entity-base-mocks';

const entityCoreShape = { id: z.string(), name: z.string(), createdAt: z.string(), updatedAt: z.string().nullable() };

/**
 * The writers of a row as responses carry them. A base schema is a reference shape and leaves them out; the full schema
 * of an entity, a membership or an API key spreads this after its select shape, so the id columns become references.
 */
export const auditShape = { createdBy: nullableActorRefSchema, updatedBy: nullableActorRefSchema };

/** The tombstone's actor, for product schemas: `deletedAt` stays the select shape's string. */
export const tombstoneShape = { deletedBy: nullableActorRefSchema };

/**
 * Exported separately to avoid circular dependencies, which is also why `included` is left out: channel
 * response schemas add `included: channelIncludedSchema` explicitly (see `organizationSchema`).
 */
export const channelBaseSchema = z
  .object({
    ...entityCoreShape,
    tenantId: z.string(),
    entityType: channelEntityTypeSchema,
    slug: z.string(),
    thumbnailUrl: z.string().nullable(),
    bannerUrl: z.string().nullable(),
  })
  .openapi('ChannelBase', {
    description:
      'The fields every channel entity shares, such as organization; a channel owns memberships and roles. Used where a response names a channel without its details, such as the channel an invitation is for.',
    example: mockChannelBase(),
    'x-tags': schemaTags('base', 'entities', 'cella'),
  });

export const productBaseSchema = z
  .object({
    ...entityCoreShape,
    description: z.string().nullable(),
    entityType: productEntityTypeSchema,
    keywords: z.string(),
  })
  .openapi('ProductBase', {
    description:
      'The fields every product entity shares, such as attachment: user-facing content that inherits access from its channel and syncs to clients. No endpoint returns it on its own; every product response starts with these fields and adds its writers as `ActorRef`s.',
    example: mockProductBase(),
    'x-tags': schemaTags('base', 'entities', 'cella'),
  });
