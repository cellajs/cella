import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { idsQuerySchema, paginationQuerySchema } from '#/utils/schema/common-schemas';
import { attachmentsTable } from '../../db/schema/attachments';

export const createAttachmentSchema = createInsertSchema(attachmentsTable);

export const deleteAttachmentsQuerySchema = idsQuerySchema;

export const attachmentSchema = z.object({
  ...createSelectSchema(attachmentsTable).shape,
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
});

export const attachmentsQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['id', 'filename', 'contentType', 'createdAt']).default('createdAt').optional(),
});
