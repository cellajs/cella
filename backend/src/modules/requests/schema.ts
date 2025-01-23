import { z } from 'zod';

import { createSelectSchema } from 'drizzle-zod';
import { requestsTable } from '#/db/schema/requests';
import { paginationQuerySchema } from '#/utils/schema/common-schemas';

const baseRequestSchema = z.object({
  ...createSelectSchema(requestsTable).shape,
  createdAt: z.string(),
});

export const requestSchema = baseRequestSchema.omit({ token: true }).extend({ requestPending: z.boolean() });

export const createRequestSchema = z.object({
  email: z.string().min(1).email(),
  type: baseRequestSchema.shape.type,
  message: z.string().nullable(),
});

export const getRequestsQuerySchema = paginationQuerySchema.merge(
  z.object({
    sort: z.enum(['id', 'email', 'type', 'createdAt']).default('createdAt').optional(),
  }),
);

export const requestMessageBodySchema = z.object({
  emails: z.array(z.string().min(1).email()),
  subject: z.string(),
  content: z.string(),
});
