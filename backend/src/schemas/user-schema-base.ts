import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { channelEntityBaseSchema } from '#/schemas/entity-base';
import { mockUserBase } from './entity-base-mocks';

// Re-export from dedicated file to avoid circular dependencies
export { userMinimalBaseSchema } from '#/schemas/user-minimal-base';

/**
 * Base schema for user, including common fields. Exported separately to avoid circular dependencies.
 * Users do not have the permissions field (only channel entities do).
 */
export const userBaseSchema = channelEntityBaseSchema
  .omit({ entityType: true, tenantId: true })
  .extend({
    description: z.string().nullable(),
    email: z.email(),
    entityType: z.literal('user'),
  })
  .openapi('UserBase', {
    description: 'Base user schema with essential fields for identification and display.',
    example: mockUserBase(),
    'x-tags': schemaTags('base', 'users', 'cella'),
  });
