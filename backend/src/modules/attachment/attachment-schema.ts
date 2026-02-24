import { z } from '@hono/zod-openapi';
import { attachmentsTable } from '#/db/schema/attachments';
import { createInsertSchema, createSelectSchema } from '#/db/utils/drizzle-schema';
import {
  batchResponseSchema,
  maxLength,
  paginationQuerySchema,
  stxBaseSchema,
  stxRequestSchema,
  validNanoidSchema,
} from '#/schemas';
import { mockAttachmentResponse } from '../../../mocks/mock-attachment';

const attachmentInsertSchema = createInsertSchema(attachmentsTable);
const attachmentSelectSchema = createSelectSchema(attachmentsTable);

export const attachmentSchema = z
  .object({
    ...attachmentSelectSchema.shape,
    stx: stxBaseSchema,
    viewCount: z.number().int().min(0).optional(),
  })
  .openapi('Attachment', {
    description: 'A file attachment belonging to an organization.',
    example: mockAttachmentResponse(),
  });

export const attachmentCreateBodySchema = attachmentInsertSchema
  .pick({
    id: true,
    name: true,
    filename: true,
    contentType: true,
    size: true,
    originalKey: true,
    bucketName: true,
    public: true,
    groupId: true,
    convertedContentType: true,
    convertedKey: true,
    thumbnailKey: true,
  })
  .extend({
    id: validNanoidSchema.optional(),
  });

/** Create body with stx for single attachment creation */
export const attachmentCreateStxBodySchema = attachmentCreateBodySchema.extend({ stx: stxRequestSchema });

/** Array schema for batch creates (1-50 attachments per request), each with own stx */
export const attachmentCreateManyStxBodySchema = attachmentCreateStxBodySchema.array().min(1).max(50);

export const attachmentUpdateBodySchema = attachmentInsertSchema
  .pick({
    name: true,
    originalKey: true,
  })
  .partial();

/** Update body with stx embedded */
export const attachmentUpdateStxBodySchema = attachmentUpdateBodySchema.extend({ stx: stxRequestSchema });

// Response schemas: batch operations use { data, rejectedItemIds }, single returns entity directly
export const attachmentCreateResponseSchema = batchResponseSchema(attachmentSchema);

const attachmentSortKeys = attachmentSelectSchema.keyof().extract(['name', 'createdAt', 'contentType']);

export const attachmentListQuerySchema = paginationQuerySchema.extend({
  sort: attachmentSortKeys.default('createdAt').optional(),
  /** ISO timestamp filter for delta sync - returns attachments modified at or after this time */
  modifiedAfter: z.iso.datetime().optional(),
});

/** Query schema for presigned URL endpoint - requires the file key to sign */
export const presignedUrlKeySchema = z.object({
  key: z.string().max(maxLength.url),
});
