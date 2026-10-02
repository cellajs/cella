import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { channelBaseSchema } from '#/schemas/entity-base';
import { mockUserBase } from './entity-base-mocks';

/** Exported separately to avoid circular dependencies. Users carry no permissions field; channel entities do. */
export const userBaseSchema = channelBaseSchema
  .omit({ entityType: true, tenantId: true })
  .extend({ description: z.string().nullable(), email: z.email(), entityType: z.literal('user') })
  .openapi('UserBase', {
    description:
      'The user fields shown to other users: name, slug, profile images, description and email. User lookups and member lists return it with the last-seen time added; member lists add the membership too.',
    example: mockUserBase(),
    'x-tags': schemaTags('base', 'users', 'cella'),
  });
