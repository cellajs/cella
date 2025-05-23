import { z } from 'zod';

import { createSelectSchema } from 'drizzle-zod';
import { requestsTable } from '#/db/schema/requests';
import { paginationQuerySchema } from '#/utils/schema/common';

const requestSelectSchema = createSelectSchema(requestsTable);

export const requestSchema = requestSelectSchema.omit({ tokenId: true }).extend({ wasInvited: z.boolean() });

export const requestCreateBodySchema = z.object({
  email: z.string().min(1).email(),
  type: requestSchema.shape.type,
  message: z.string().nullable(),
});

export const requestListQuerySchema = paginationQuerySchema.merge(
  z.object({
    sort: z.enum(['id', 'email', 'type', 'createdAt']).default('createdAt').optional(),
  }),
);
