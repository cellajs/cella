import { z } from 'zod';

import { createSelectSchema } from 'drizzle-zod';
import { requestsTable } from '../../db/schema/requests';
import {
  paginationQuerySchema,
} from '../../lib/common-schemas';

export const requestsSchema = createSelectSchema(requestsTable);

export const createRequestSchema = z.object({
  email: z.string().min(1).email(),
  type: requestsSchema.shape.type,
  message: z.string().nullable(),
});

export const requestResponseSchema = z.object({
  email: z.string().min(1).email(),
  type: requestsSchema.shape.type,
});

export const apiRequestSchema = z.object({
  ...createSelectSchema(requestsTable).shape,
  createdAt: z.string(),
});

export const getRequestsQuerySchema = paginationQuerySchema.merge(
  z.object({
    sort: z.enum(['id', 'email', 'type', 'createdAt']).default('createdAt').optional(),
  }),
);