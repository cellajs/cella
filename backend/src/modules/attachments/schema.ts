import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { paginationQuerySchema } from '#/utils/schema/common';
import { attachmentsTable } from '../../db/schema/attachments';

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

export const attachmentSchema = attachmentSelectSchema.omit({ originalKey: true, convertedKey: true, thumbnailKey: true }).merge(
  z.object({
    url: z.string(),
    thumbnailUrl: z.string().nullable(),
    convertedUrl: z.string().nullable(),
  }),
);

export const attachmentListQuerySchema = paginationQuerySchema.extend({
  attachmentId: z.string().optional(),
  sort: z.enum(['id', 'filename', 'contentType', 'createdAt']).default('createdAt').optional(),
});
