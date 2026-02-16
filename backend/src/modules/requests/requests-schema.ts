import { z } from '@hono/zod-openapi';
import { requestsTable } from '#/db/schema/requests';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { maxLength, paginationQuerySchema } from '#/schemas';
import { mockRequestResponse } from '../../../mocks/mock-entity-base';

const requestSelectSchema = createSelectSchema(requestsTable);

export const requestSchema = requestSelectSchema
  .omit({ tokenId: true })
  .extend({ wasInvited: z.boolean() })
  .openapi('Request', {
    description: 'A contact or waitlist submission from an unauthenticated user.',
    example: mockRequestResponse(),
  });

export const requestCreateBodySchema = z.object({
  email: z.email().max(maxLength.field),
  type: requestSchema.shape.type,
  message: z.string().max(maxLength.field).nullable(),
});

export const requestListQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['id', 'email', 'type', 'createdAt']).default('createdAt').optional(),
});
