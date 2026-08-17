import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { evolutionContract } from '#/core/schema-evolution/evolution-contract';
import { createInsertSchema, createSelectSchema, describeFields } from '#/db/utils/drizzle-schema';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { productViewCountSchema } from '#/modules/entities/entities-schema';
import { batchResponseSchema, maxLength, paginationQuerySchema, stxBaseSchema, validUuidSchema } from '#/schemas';
import { nullableUserMinimalBaseSchema } from '#/schemas/minimal-base';
import { mockAttachmentResponse } from './attachment-mocks';

/**
 * Storage object keys per variant, keyed by the variant name. `original` is always present
 * (every upload has one); other variants appear only once the pipeline generates them.
 * This is the single place the variant set is enumerated for storage keys.
 */
export const attachmentKeysSchema = z.object({
  original: z.string(),
  preview: z.string().optional(),
  thumbnail: z.string().optional(),
  converted: z.string().optional(),
});
export type AttachmentKeys = z.infer<typeof attachmentKeysSchema>;

// Attachment-specific field docs, applied to both generated schemas so they reach every CRUD surface.
const attachmentFieldDescriptions = {
  contentType: 'MIME type of the uploaded file (e.g. image/png).',
  convertedContentType: 'MIME type of the server-converted variant; null when none.',
  publicBucket: 'When true, the file is stored in the public bucket and served from the CDN without a presigned URL.',
  keys: 'Storage object keys per variant, keyed by variant name; only generated variants are present.',
} as const;

const keysRefinement = { keys: attachmentKeysSchema };
const attachmentInsertSchema = describeFields(
  createInsertSchema(attachmentsTable, keysRefinement),
  attachmentFieldDescriptions,
);
const attachmentSelectSchema = describeFields(
  createSelectSchema(attachmentsTable, keysRefinement),
  attachmentFieldDescriptions,
);

export const attachmentSchema = z
  .object({
    ...attachmentSelectSchema.shape,
    createdBy: nullableUserMinimalBaseSchema,
    updatedBy: nullableUserMinimalBaseSchema,
    stx: stxBaseSchema,
    viewCount: productViewCountSchema,
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
    keys: true,
    bucketName: true,
    publicBucket: true,
    groupId: true,
    convertedContentType: true,
  })
  .extend({
    id: validUuidSchema,
    // The column defaults to {}, which would make `keys` optional on the generated insert schema.
    // Creates must carry at least the original key, so require it here.
    keys: attachmentKeysSchema,
  });

/** Wire registration: lens-widened schemas + entity-bound runtime seams for attachment */
export const attachmentContract = evolutionContract.product('attachment', {
  createItem: attachmentCreateBodySchema,
  updateOps: {
    name: z.string().max(maxLength.field),
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
export const attachmentVariantSchema = z.enum(['original', 'preview', 'thumbnail', 'converted']);

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
