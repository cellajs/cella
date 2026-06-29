import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { mockUserMinimalBase } from './entity-base-mocks';

/**
 * Minimal user schema for references (e.g. createdBy, updatedBy).
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
    entityType: z.literal('user'),
  })
  .openapi('UserMinimalBase', {
    description: 'Minimal user data for references.',
    example: mockUserMinimalBase(),
    'x-tags': schemaTags('base', 'users', 'cella'),
  });
