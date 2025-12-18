import { z } from '@hono/zod-openapi';
import { contextEntityTypeSchema, idSchema, imageUrlSchema, nameSchema, slugSchema } from '#/utils/schema/common';

/**
 * Base schema for context entities, including common fields. Exported separately to avoid circular dependencies.
 */
export const contextEntityBaseSchema = z
  .object({
    id: idSchema,
    entityType: contextEntityTypeSchema,
    slug: slugSchema,
    name: nameSchema,
    createdAt: z.string(),
    thumbnailUrl: imageUrlSchema.nullable().optional(),
    bannerUrl: imageUrlSchema.nullable().optional(),
  })
  .openapi('ContextEntityBase');
