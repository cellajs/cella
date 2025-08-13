import { z } from '@hono/zod-openapi';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { attachmentsTable } from '#/db/schema/attachments';
import { paginationQuerySchema } from '#/utils/schema/common';

const attachmentInsertSchema = createInsertSchema(attachmentsTable);
const attachmentSelectSchema = createSelectSchema(attachmentsTable);

export const attachmentCreateManySchema = z
  .array(
    attachmentInsertSchema.omit({
      name: true,
      entityType: true,
      modifiedAt: true,
      modifiedBy: true,
      createdAt: true,
      createdBy: true,
    }),
  )
  .min(1)
  .max(50);

export const attachmentUpdateBodySchema = attachmentInsertSchema
  .pick({
    name: true,
    originalKey: true,
  })
  .partial();

export const attachmentSchema = attachmentSelectSchema.omit({ originalKey: true, convertedKey: true, thumbnailKey: true }).extend({
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
  convertedUrl: z.string().nullable(),
});

export const attachmentListQuerySchema = paginationQuerySchema.extend({
  attachmentId: z.string().optional(),
  sort: z.enum(['id', 'name', 'size', 'createdAt']).default('createdAt').optional(),
});
