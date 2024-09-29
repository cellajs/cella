import { z } from 'zod';

import { createSelectSchema } from 'drizzle-zod';
import { requestsTable } from '#/db/schema/requests';
import { paginationQuerySchema } from '#/utils/schema/common-schemas';

export const requestSchema = z.object({
  ...createSelectSchema(requestsTable).shape,
  createdAt: z.string(),
});

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
