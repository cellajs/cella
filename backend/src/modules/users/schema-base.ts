import { z } from '@hono/zod-openapi';
import { contextEntityBaseSchema } from '#/modules/entities/schema-base';

/**
 * Base schema for user, including common fields. Exported separately to avoid circular dependencies.
 */
export const userBaseSchema = contextEntityBaseSchema
  .omit({ entityType: true })
  .extend({
    email: z.email(),
    entityType: z.literal('user'),
  })
  .openapi('UserBase');
