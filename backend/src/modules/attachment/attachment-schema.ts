import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { evolutionContract } from '#/core/schema-evolution/evolution-contract';
import { createInsertSchema, createSelectSchema, describeFields } from '#/db/utils/drizzle-schema';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { batchResponseSchema, maxLength, paginationQuerySchema, stxBaseSchema, validUuidSchema } from '#/schemas';
import { userMinimalBaseSchema } from '#/schemas/user-minimal-base';
import { mockAttachmentResponse } from './attachment-mocks';

// Attachment-specific field docs, applied to both generated schemas so they reach every CRUD surface.
const attachmentFieldDescriptions = {
  contentType: 'MIME type of the uploaded file (e.g. image/png).',
  convertedContentType: 'MIME type of the server-converted variant; null when none.',
  publicBucket: 'When true, the file is stored in the public bucket and served from the CDN without a presigned URL.',
  originalKey: 'Storage object key for the original uploaded file.',
  convertedKey: 'Storage object key for the converted variant; null when none.',
  thumbnailKey: 'Storage object key for the generated thumbnail; null when none.',
} as const;

const attachmentInsertSchema = describeFields(createInsertSchema(attachmentsTable), attachmentFieldDescriptions);
const attachmentSelectSchema = describeFields(createSelectSchema(attachmentsTable), attachmentFieldDescriptions);

export const attachmentSchema = z
  .object({
    ...attachmentSelectSchema.shape,
    createdBy: userMinimalBaseSchema.nullable(),
    updatedBy: userMinimalBaseSchema.nullable(),
    stx: stxBaseSchema,
    viewCount: z.number().int().min(0).optional(),
  })
  .openapi('Attachment', {
    description: 'A product entity for file attachment metadata.',
    example: mockAttachmentResponse(),
    'x-tags': schemaTags('data', 'attachments', 'cella'),
  });

const attachmentCreateBodySchema = attachmentInsertSchema
  .pick({
    id: true,
    name: true,
    filename: true,
    contentType: true,
    size: true,
    originalKey: true,
    bucketName: true,
    publicBucket: true,
    groupId: true,
    convertedContentType: true,
    convertedKey: true,
    thumbnailKey: true,
  })
  .extend({
    id: validUuidSchema,
  });

/** Wire registration: lens-widened schemas + entity-bound runtime seams for attachment */
export const attachmentContract = evolutionContract.product('attachment', {
  createItem: attachmentCreateBodySchema,
  updateOps: {
    name: z.string().max(maxLength.field),
    originalKey: z.string(),
  },
});

/** Array schema for batch creates (1-50 attachments per request), each with own stx */
export const attachmentCreateManyStxBodySchema = attachmentContract.createItemSchema.array().min(1).max(50);

/** Update body using fields pattern for single or multi-field updates with conflict detection */
export const attachmentUpdateStxBodySchema = attachmentContract.updateBodySchema;

// Response schemas: batch operations use { data, rejectedIds }, single returns entity directly
export const attachmentCreateResponseSchema = batchResponseSchema(attachmentSchema);

const attachmentSortKeys = attachmentSelectSchema.keyof().extract(['name', 'createdAt', 'contentType']);

export const attachmentListQuerySchema = paginationQuerySchema.extend({
  sort: attachmentSortKeys.default('createdAt').optional(),
});

/** Selectable stored-file variants. Mirrors the frontend `BlobVariant`. */
export const attachmentVariantSchema = z.enum(['original', 'thumbnail', 'converted']);

/**
 * Body schema for the batch presigned URLs endpoint. Callers reference private
 * attachments by `attachmentId` + `variant`; clients never submit storage keys.
 * The server resolves the owning rows (RLS + permission) and fails closed before
 * signing. Public media is served from the CDN and never reaches this endpoint.
 */
export const presignedUrlsBodySchema = z.object({
  items: z
    .array(
      z.object({
        attachmentId: validUuidSchema,
        variant: attachmentVariantSchema.default('original'),
      }),
    )
    .min(1)
    .max(50),
});

/**
 * One signed download URL in the batch response. Missing and denied ids collapse
 * into a uniform `rejectedIds` list (nonexistent and forbidden are indistinguishable).
 */
export const presignedUrlItemSchema = z.object({
  attachmentId: validUuidSchema,
  variant: attachmentVariantSchema,
  url: z.string(),
});
