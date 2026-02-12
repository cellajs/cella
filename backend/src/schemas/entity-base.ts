import { z } from '@hono/zod-openapi';
import { contextEntityTypeSchema, productEntityTypeSchema } from '#/schemas';
import { mockContextEntityBase, mockProductEntityBase } from '../../mocks/mock-entity-base';

/**
 * Base schema shared by all entities (mirrors baseEntityColumns).
 */
const entityBaseShape = {
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
};

/**
 * Audit fields for entities that track who created/modified them.
 */
const auditShape = {
  createdBy: z.string().nullable(),
  modifiedBy: z.string().nullable(),
};

/**
 * Base schema for context entities, including common fields. Exported separately to avoid circular dependencies.
 */
export const contextEntityBaseSchema = z
  .object({
    ...entityBaseShape,
    tenantId: z.string(),
    entityType: contextEntityTypeSchema,
    slug: z.string(),
    thumbnailUrl: z.string().nullable(),
    bannerUrl: z.string().nullable(),
  })
  .openapi('ContextEntityBase', { example: mockContextEntityBase() });

/**
 * Base schema for product entities, including common fields. Exported separately to avoid circular dependencies.
 */
export const productEntityBaseSchema = z
  .object({
    ...entityBaseShape,
    ...auditShape,
    entityType: productEntityTypeSchema,
    keywords: z.string(),
  })
  .openapi('ProductEntityBase', { example: mockProductEntityBase() });
