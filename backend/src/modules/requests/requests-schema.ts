import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { requestsTable, requestTypeEnum } from '#/modules/requests/requests-db';
import { mockRequestResponse } from '#/modules/requests/requests-mocks';
import { paginationQuerySchema, validEmailSchema } from '#/schemas';

export const requestSchema = createSelectSchema(requestsTable)
  .omit({ invitedAt: true })
  // The enum column keeps its literal union only through an explicit schema.
  .extend({ type: z.enum(requestTypeEnum), wasInvited: z.boolean() })
  .openapi('Request', {
    description:
      'A message from the public site: a contact message, a waitlist sign-up or a newsletter subscription. Anyone can send one, signed in or not; system admins list them.',
    example: mockRequestResponse(),
    'x-tags': schemaTags('data', 'requests', 'cella'),
  });

export const requestCreateBodySchema = z.object({
  email: validEmailSchema,
  type: requestSchema.shape.type,
  /** A contact message runs to a few paragraphs; a waitlist or newsletter request has none. */
  message: z.string().max(5000).nullable(),
});

export const requestListQuerySchema = paginationQuerySchema.extend({ sort: z.enum(['id', 'email', 'type', 'createdAt']).default('createdAt') });
