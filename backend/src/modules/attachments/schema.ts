import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { paginationQuerySchema } from '#/utils/schema/common';
import { attachmentsTable } from '../../db/schema/attachments';

const attachmentsInsertSchema = createInsertSchema(attachmentsTable);

export const createAttachmentsSchema = z
  .array(
    attachmentsInsertSchema.omit({
      name: true,
      entity: true,
      modifiedAt: true,
      modifiedBy: true,
      createdAt: true,
      createdBy: true,
    }),
  )
  .min(1)
  .max(50);

export const updateAttachmentBodySchema = attachmentsInsertSchema
  .pick({
    name: true,
    url: true,
  })
  .partial();

export const attachmentSchema = z.object({
  ...createSelectSchema(attachmentsTable).shape,
});

export const attachmentsQuerySchema = paginationQuerySchema.extend({
  attachmentId: z.string().optional(),
  sort: z.enum(['id', 'filename', 'contentType', 'createdAt']).default('createdAt').optional(),
});
