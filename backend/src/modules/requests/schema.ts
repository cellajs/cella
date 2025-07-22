import { requestsTable } from '#/db/schema/requests';
import { paginationQuerySchema } from '#/utils/schema/common';
import { z } from '@hono/zod-openapi';
import { createSelectSchema } from 'drizzle-zod';

const requestSelectSchema = createSelectSchema(requestsTable);

export const requestSchema = requestSelectSchema.omit({ tokenId: true }).extend({ wasInvited: z.boolean() });

export const requestCreateBodySchema = z.object({
  email: z.email(),
  type: requestSchema.shape.type,
  message: z.string().nullable(),
});

export const requestListQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['id', 'email', 'type', 'createdAt']).default('createdAt').optional(),
});
