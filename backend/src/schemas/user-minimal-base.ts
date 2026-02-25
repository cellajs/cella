import { z } from '@hono/zod-openapi';
import { mockUserMinimalBase } from '../../mocks/mock-entity-base';

/**
 * Minimal user schema for references (e.g. createdBy, modifiedBy).
 * Contains only the fields needed to render a user cell (avatar + name + link).
 *
 * Defined in its own file to avoid circular dependencies between entity-base and user-schema-base.
 */
export const userMinimalBaseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    thumbnailUrl: z.string().nullable(),
    email: z.email(),
    entityType: z.literal('user'),
  })
  .openapi('UserMinimalBase', {
    description: 'Minimal user data for references (e.g. createdBy, modifiedBy).',
    example: mockUserMinimalBase(),
  });
