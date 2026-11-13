import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { requestKinds, requestsTable } from '#/modules/requests/requests-db';
import { mockRequestResponse } from '#/modules/requests/requests-mocks';
import { listQuerySchema, orderByQuerySchema, validEmailSchema } from '#/schemas';

export const requestSchema = createSelectSchema(requestsTable)
  .omit({ mailedAt: true })
  .extend({ kind: z.enum(requestKinds), invited: z.boolean() })
  .openapi('Request', {
    description:
      'A message from the public site: a contact message, a waitlist sign-up or an info request. Anyone can send one, signed in or not; system admins list them.',
    example: mockRequestResponse(),
    'x-tags': schemaTags('data', 'requests', 'cella'),
  });

export const requestCreateBodySchema = z.object({
  email: validEmailSchema,
  kind: requestSchema.shape.kind,
  /** A contact message runs to a few paragraphs; a waitlist or info request has none. */
  message: z.string().max(5000).nullable(),
});

export const requestListQuerySchema = listQuerySchema.extend({ orderBy: orderByQuerySchema(['id', 'email', 'kind', 'createdAt'], 'createdAt desc') });
