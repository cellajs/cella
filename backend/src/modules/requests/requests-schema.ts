import { z } from '@hono/zod-openapi';
import { createSelectSchema } from 'drizzle-zod';
import { requestsTable } from '#/db/schema/requests';
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
