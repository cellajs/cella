import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { channelEntityTypeSchema, productEntityTypeSchema } from '#/schemas';
import { nullableUserMinimalBaseSchema } from '#/schemas/minimal-base';
import { mockChannelBase, mockProductBase } from './entity-base-mocks';

const entityCoreShape = {
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
};

const auditShape = {
  createdBy: nullableUserMinimalBaseSchema,
  updatedBy: nullableUserMinimalBaseSchema,
};

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
    description: 'Base schema for entities with memberships (e.g. organization).',
    example: mockChannelBase(),
    'x-tags': schemaTags('base', 'entities', 'cella'),
  });

/** Exported separately to avoid circular dependencies. */
export const productBaseSchema = z
  .object({
    ...entityCoreShape,
    description: z.string().nullable(),
    ...auditShape,
    entityType: productEntityTypeSchema,
    keywords: z.string(),
  })
  .openapi('ProductBase', {
    description: 'Base schema for content entities with creator tracking (e.g. page, attachment).',
    example: mockProductBase(),
    'x-tags': schemaTags('base', 'entities', 'cella'),
  });
