import { z } from '@hono/zod-openapi';
import { contextEntityTypeSchema, productEntityTypeSchema } from '#/schemas';
import { userMinimalBaseSchema } from '#/schemas/user-minimal-base';
import { mockContextEntityBase, mockProductEntityBase } from '../../mocks/mock-entity-base';

/**
 * Core fields shared by all entities (id, name, timestamps).
 */
const entityCoreShape = {
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
};

/**
 * Audit fields for entities that track who created/modified them.
 */
const auditShape = {
  createdBy: userMinimalBaseSchema.nullable(),
  modifiedBy: userMinimalBaseSchema.nullable(),
};

/**
 * Base schema for context entities, including common fields. Exported separately to avoid circular dependencies.
 *
 * Note: `included` is NOT part of the base schema to avoid circular dependencies.
 * Context entity response schemas should add `included: contextEntityIncludedSchema` explicitly.
 * Import `contextEntityIncludedSchema` directly from `#/schemas/context-entity-included`.
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
  });
