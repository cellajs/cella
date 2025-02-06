import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { nameSchema, paginationQuerySchema } from '#/utils/schema/common-schemas';
import { attachmentsTable } from '../../db/schema/attachments';

export const createAttachmentsSchema = z
  .array(
    createInsertSchema(attachmentsTable).omit({
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

export const updateAttachmentBodySchema = createInsertSchema(attachmentsTable, {
  name: nameSchema,
})
  .pick({
    name: true,
  })
  .partial();

export const attachmentSchema = z.object({
  ...createSelectSchema(attachmentsTable).shape,
  createdAt: z.string(),
  modifiedAt: z.string().nullable(),
});

export const attachmentsQuerySchema = paginationQuerySchema.extend({
  sort: z.enum(['id', 'filename', 'contentType', 'createdAt']).default('createdAt').optional(),
});
