import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { requestsTable } from '#/modules/requests/requests-db';
import { maxLength, paginationQuerySchema } from '#/schemas';
import { mockRequestBaseResponse } from './requests-mocks';

const requestSelectSchema = createSelectSchema(requestsTable);

export const requestSchema = requestSelectSchema
  .omit({ tokenId: true })
  .extend({ wasInvited: z.boolean() })
  .openapi('Request', {
    description: 'A contact or waitlist submission from an unauthenticated user.',
    example: mockRequestBaseResponse(),
    'x-tags': schemaTags('data', 'requests', 'cella'),
  });

export const requestCreateBodySchema = z.object({
  email: z.email().max(maxLength.field),
  type: requestSchema.shape.type,
  message: z.string().max(maxLength.field).nullable(),
});

export const requestListQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['id', 'email', 'type', 'createdAt']).default('createdAt').optional(),
});
