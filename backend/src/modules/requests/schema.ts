import { z } from 'zod';

import { createSelectSchema } from 'drizzle-zod';
import { requestsTable } from '../../db/schema/requests';
import { paginationQuerySchema } from '../../lib/common-schemas';
import { t } from '../../lib/utils';

const requestsTableSchema = createSelectSchema(requestsTable);

export const requestsSchema = z.object({
  email: z
    .string()
    .email(t('invalid.email'))
    .min(1, { message: t('required') }),
  type: requestsTableSchema.shape.type,
});

export const createRequestSchema = requestsSchema.extend({ message: z.string().nullable() });

export const requestsInfoSchema = requestsTableSchema.extend({ createdAt: z.string() });

export const getRequestsQuerySchema = paginationQuerySchema.merge(
  z.object({
    sort: z.enum(['id', 'email', 'type', 'createdAt']).default('createdAt').optional(),
  }),
);
