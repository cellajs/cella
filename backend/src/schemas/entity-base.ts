import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { contextEntityTypeSchema, productEntityTypeSchema } from '#/schemas';
import { userMinimalBaseSchema } from '#/schemas/user-minimal-base';
import { mockContextEntityBase, mockProductEntityBase } from './entity-base-mocks';

/**
 * Core fields shared by all entities (id, name, timestamps).
 */
const entityCoreShape = {
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
};

/**
 * Audit fields for entities that track who created/modified them.
 */
const auditShape = {
  createdBy: userMinimalBaseSchema.nullable(),
  updatedBy: userMinimalBaseSchema.nullable(),
};

/**
 * Base schema for context entities, including common fields. Exported separately to avoid circular dependencies.
 *
 * `included` is not part of the base schema to avoid circular dependencies.
 * Context entity response schemas add `included: contextEntityIncludedSchema` explicitly.
 * Import `contextEntityIncludedSchema` directly from its context entity included schema module.
 * See organizationSchema for reference.
 */
export const contextEntityBaseSchema = z
  .object({
    ...entityCoreShape,
    tenantId: z.string(),
    entityType: contextEntityTypeSchema,
    slug: z.string(),
    thumbnailUrl: z.string().nullable(),
    bannerUrl: z.string().nullable(),
  })
  .openapi('ContextEntityBase', {
    description: 'Base schema for entities with memberships (e.g. organization).',
    example: mockContextEntityBase(),
    'x-tags': schemaTags('base', 'entities', 'cella'),
  });

/**
 * Base schema for product entities, including common fields. Exported separately to avoid circular dependencies.
 */
export const productEntityBaseSchema = z
  .object({
    ...entityCoreShape,
    description: z.string().nullable(),
    ...auditShape,
    entityType: productEntityTypeSchema,
    keywords: z.string(),
  })
  .openapi('ProductEntityBase', {
    description: 'Base schema for content entities with creator tracking (e.g. page, attachment).',
    example: mockProductEntityBase(),
    'x-tags': schemaTags('base', 'entities', 'cella'),
  });
