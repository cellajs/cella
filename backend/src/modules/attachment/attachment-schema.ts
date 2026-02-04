import { z } from '@hono/zod-openapi';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { attachmentsTable } from '#/db/schema/attachments';
import { txBaseSchema } from '#/db/utils/tx-columns';
import { batchResponseSchema, entityCanSchema, paginationQuerySchema, txRequestSchema } from '#/schemas';
import { mockAttachmentResponse } from '../../../mocks/mock-attachment';

const attachmentInsertSchema = createInsertSchema(attachmentsTable);
const attachmentSelectSchema = createSelectSchema(attachmentsTable);

export const attachmentSchema = z
  .object({
    ...attachmentSelectSchema.shape,
    tx: txBaseSchema,
    can: entityCanSchema.optional(),
  })
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

/** Create body with tx for single attachment creation */
export const attachmentCreateTxBodySchema = attachmentCreateBodySchema.extend({ tx: txRequestSchema });

/** Array schema for batch creates (1-50 attachments per request), each with own tx */
export const attachmentCreateManyTxBodySchema = attachmentCreateTxBodySchema.array().min(1).max(50);

export const attachmentUpdateBodySchema = attachmentInsertSchema
  .pick({
    name: true,
    originalKey: true,
  })
  .partial();

/** Update body with tx embedded */
export const attachmentUpdateTxBodySchema = attachmentUpdateBodySchema.extend({ tx: txRequestSchema });

// Response schemas: batch operations use { data, rejectedItemIds }, single returns entity directly
export const attachmentCreateResponseSchema = batchResponseSchema(attachmentSchema);

const attachmentSortKeys = attachmentSelectSchema.keyof().extract(['name', 'createdAt', 'contentType']);

export const attachmentListQuerySchema = paginationQuerySchema.extend({
  sort: attachmentSortKeys.default('createdAt').optional(),
  /** ISO timestamp filter for delta sync - returns attachments modified at or after this time */
  modifiedAfter: z.string().datetime().optional(),
});
