import { z } from '@hono/zod-openapi';
import { requestsTable } from '#/db/schema/requests';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { paginationQuerySchema } from '#/schemas';
import { mockRequestResponse } from '../../../mocks/mock-entity-base';

const requestSelectSchema = createSelectSchema(requestsTable);

export const requestSchema = requestSelectSchema
  .omit({ tokenId: true })
  .extend({ wasInvited: z.boolean() })
  .openapi('Request', { example: mockRequestResponse() });

export const requestCreateBodySchema = z.object({
  email: z.email(),
  type: requestSchema.shape.type,
  message: z.string().nullable(),
});

export const requestListQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['id', 'email', 'type', 'createdAt']).default('createdAt').optional(),
});
