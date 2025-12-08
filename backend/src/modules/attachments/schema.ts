import { z } from '@hono/zod-openapi';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { attachmentsTable } from '#/db/schema/attachments';
import { paginationQuerySchema } from '#/utils/schema/common';

const attachmentInsertSchema = createInsertSchema(attachmentsTable);
// TODO(tanstackDB) fix errors from schema
export const attachmentSchema = createSelectSchema(attachmentsTable).openapi('Attachment');

export const attachmentCreateManySchema = attachmentInsertSchema.array().min(1).max(50);

export const attachmentUpdateBodySchema = attachmentInsertSchema
  .pick({
    name: true,
    originalKey: true,
  })
  .partial();

export const attachmentListQuerySchema = paginationQuerySchema.extend({
  attachmentId: z.string().optional(),
  sort: z.enum(['id', 'name', 'size', 'createdAt']).default('createdAt').optional(),
});
