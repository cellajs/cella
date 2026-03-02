import { z } from '@hono/zod-openapi';
import { contextEntityBaseSchema } from '#/schemas/entity-base';
import { mockUserBase } from '../../mocks/mock-entity-base';

// Re-export from dedicated file to avoid circular dependencies
export { userMinimalBaseSchema } from '#/schemas/user-minimal-base';

/**
 * Base schema for user, including common fields. Exported separately to avoid circular dependencies.
 * Users do not have the permissions field (only context entities do).
 */
export const userBaseSchema = contextEntityBaseSchema
  .omit({ entityType: true, tenantId: true })
  .extend({
    description: z.string().nullable(),
    email: z.email(),
    entityType: z.literal('user'),
  })
  .openapi('UserBase', {
    description: 'Base user schema with essential fields for identification and display.',
    example: mockUserBase(),
  });
