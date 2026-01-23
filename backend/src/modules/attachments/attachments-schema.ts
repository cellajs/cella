import { z } from '@hono/zod-openapi';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { attachmentsTable } from '#/db/schema/attachments';
import { createTxMutationSchema, createTxResponseSchema } from '#/modules/sync/schema';
import { entityCanSchema, paginationQuerySchema } from '#/utils/schema/common';
import { mockAttachmentResponse } from '../../../mocks/mock-attachment';

const attachmentInsertSchema = createInsertSchema(attachmentsTable);
const attachmentSelectSchema = createSelectSchema(attachmentsTable);

export const attachmentSchema = attachmentSelectSchema
  .omit({ tx: true }) // Don't expose tx in API responses
  .extend({ can: entityCanSchema.optional() })
  .openapi('Attachment', { example: mockAttachmentResponse() });

export const attachmentCreateBodySchema = attachmentInsertSchema.pick({
  id: true,
  name: true,
  filename: true,
  contentType: true,
  size: true,
  organizationId: true,
  createdBy: true,
  originalKey: true,
  bucketName: true,
  public: true,
  groupId: true,
  convertedContentType: true,
  convertedKey: true,
  thumbnailKey: true,
});

export const attachmentCreateManySchema = attachmentCreateBodySchema.array().min(1).max(50);

export const attachmentUpdateBodySchema = attachmentInsertSchema
  .pick({
    name: true,
    originalKey: true,
  })
  .partial();

// Tx-wrapped schemas for product entity mutations (batch create uses array)
export const attachmentCreateTxBodySchema = createTxMutationSchema(attachmentCreateManySchema);
export const attachmentUpdateTxBodySchema = createTxMutationSchema(attachmentUpdateBodySchema);
export const attachmentTxResponseSchema = createTxResponseSchema(z.array(attachmentSchema));
export const attachmentUpdateTxResponseSchema = createTxResponseSchema(attachmentSchema);

const attachmentSortKeys = attachmentSelectSchema.keyof().extract(['name', 'createdAt', 'contentType']);

export const attachmentListQuerySchema = paginationQuerySchema.extend({
  sort: attachmentSortKeys.default('createdAt').optional(),
});
