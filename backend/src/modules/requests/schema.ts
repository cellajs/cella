import { z } from 'zod';

import { createSelectSchema } from 'drizzle-zod';
import { requestsTable } from '#/db/schema/requests';
import { paginationQuerySchema } from '#/utils/schema/common';

const requestTableSchema = z.object({
  ...createSelectSchema(requestsTable).shape,
});

export const requestSchema = requestTableSchema.omit({ tokenId: true }).extend({ wasInvited: z.boolean() });

export const createRequestSchema = z.object({
  email: z.string().min(1).email(),
  type: requestSchema.shape.type,
  message: z.string().nullable(),
});

export const getRequestsQuerySchema = paginationQuerySchema.merge(
  z.object({
    sort: z.enum(['id', 'email', 'type', 'createdAt']).default('createdAt').optional(),
  }),
);
