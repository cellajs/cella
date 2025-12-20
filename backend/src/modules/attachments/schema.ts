import { z } from '@hono/zod-openapi';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { attachmentsTable } from '#/db/schema/attachments';

const attachmentInsertSchema = createInsertSchema(attachmentsTable);
export const attachmentSchema = z.object(createSelectSchema(attachmentsTable).shape).openapi('Attachment');

export const attachmentCreateManySchema = attachmentInsertSchema.array().min(1).max(50);

export const attachmentUpdateBodySchema = attachmentInsertSchema
  .pick({
    name: true,
    originalKey: true,
  })
  .partial();
