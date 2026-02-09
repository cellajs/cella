import { z } from '@hono/zod-openapi';
import {
  contextEntityTypeSchema,
  idSchema,
  imageUrlSchema,
  nameSchema,
  productEntityTypeSchema,
  slugSchema,
} from '#/schemas';
import { mockContextEntityBase, mockProductEntityBase } from '../../../mocks/mock-entity-base';

// TODO-026 consider moving all these to backend/src/schemas/entity-base.ts?

/**
 * Base schema shared by all entities (mirrors baseEntityColumns).
 */
const entityBaseShape = {
  id: idSchema,
  name: nameSchema,
  description: z.string().nullable(),
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
};

/**
 * Audit fields for entities that track who created/modified them.
 */
const auditShape = {
  createdBy: idSchema.nullable(),
  modifiedBy: idSchema.nullable(),
};

/**
 * Base schema for context entities, including common fields. Exported separately to avoid circular dependencies.
 */
export const contextEntityBaseSchema = z
  .object({
    ...entityBaseShape,
    entityType: contextEntityTypeSchema,
    slug: slugSchema,
    thumbnailUrl: imageUrlSchema.nullable(),
    bannerUrl: imageUrlSchema.nullable(),
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
