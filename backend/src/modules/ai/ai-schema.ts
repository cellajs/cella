import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { chatsTable } from '#/db/schema/chats';
import { messagesTable } from '#/db/schema/messages';
import { relatedContextShape } from '#/db/utils/context-relation-schema';
import { createSelectSchema } from '#/db/utils/drizzle-schema';
import { maxLength, paginationQuerySchema, stxBaseSchema } from '#/schemas';

const chatSelectSchema = createSelectSchema(chatsTable);
const messageSelectSchema = createSelectSchema(messagesTable);

export const chatSchema = z
  .object({
    ...chatSelectSchema.omit({ createdBy: true, updatedBy: true, stx: true }).shape,
    stx: stxBaseSchema,
  })
  .openapi('Chat', {
    description: 'An AI chat session scoped to a user within an organization.',
    'x-tags': schemaTags('data', 'ai', 'cella'),
  });

export const messageSchema = z
  .object({
    ...messageSelectSchema.omit({ createdBy: true, updatedBy: true, stx: true }).shape,
    stx: stxBaseSchema,
  })
  .openapi('Message', {
    description: 'A single message within a chat session.',
    'x-tags': schemaTags('data', 'ai', 'cella'),
  });

export const chatCreateBodySchema = z.object({
  content: z.string().min(1).max(maxLength.html),
  ...relatedContextShape('chat'),
});

export const messageCreateBodySchema = z.object({
  content: z.string().min(1).max(maxLength.html),
});

export const chatUpdateBodySchema = z.object({
  name: z.string().max(maxLength.field).optional(),
  archived: z.boolean().optional(),
});

export const chatListQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['createdAt', 'updatedAt']).default('createdAt').optional(),
  order: z.enum(['asc', 'desc']).default('desc').optional(),
  archived: z.enum(['true', 'false']).default('false').optional(),
  ...relatedContextShape('chat'),
});

export const messageListQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['createdAt']).default('createdAt').optional(),
  order: z.enum(['asc', 'desc']).default('asc').optional(),
});
