import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { evolutionContract } from '#/core/schema-evolution/evolution-contract';
import { createInsertSchema, createSelectSchema } from '#/db/utils/drizzle-schema';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { batchResponseSchema, maxLength, paginationQuerySchema, stxBaseSchema, validUuidSchema } from '#/schemas';
import { userMinimalBaseSchema } from '#/schemas/user-minimal-base';
import { mockAttachmentResponse } from './attachment-mocks';

const attachmentInsertSchema = createInsertSchema(attachmentsTable);
const attachmentSelectSchema = createSelectSchema(attachmentsTable);

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
    public: true,
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
  /** Materialized id-path prefix: restrict to rows at or below this subtree node. */
  pathPrefix: z.string().max(512).optional(),
});

/** Selectable stored-file variants. Mirrors the frontend `BlobVariant`. */
export const attachmentVariantSchema = z.enum(['original', 'thumbnail', 'converted']);

/**
 * Query schema for the presigned URL endpoint. Callers reference a private
 * attachment by `attachmentId` + `variant`. Clients never submit storage keys.
 * The server resolves the owning row (RLS + permission) and fails closed before
 * signing, so an unknown/cross-tenant id can never be signed. Public media is
 * served directly from the CDN and never reaches this endpoint.
 */
export const presignedUrlQuerySchema = z.object({
  attachmentId: validUuidSchema,
  variant: attachmentVariantSchema.default('original'),
});
