import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { channelBaseSchema } from '#/schemas/entity-base';
import { mockUserBase } from '#/schemas/entity-base-mocks';

export const userBaseSchema = channelBaseSchema
  .omit({ entityType: true, tenantId: true })
  .extend({
    description: z.string().nullable(),
    email: z.email().openapi({ description: 'The primary email address, shown to every user who shares an organization with this one.' }),
    entityType: z.literal('user'),
  })
  .openapi('UserBase', {
    description:
      'The user fields shown to every user who shares an organization with this one: name, slug, profile images, description and email address. User lookups and member lists return it with the last-seen time added; member lists add the membership too.',
    example: mockUserBase(),
    'x-tags': schemaTags('base', 'users', 'cella'),
  });
