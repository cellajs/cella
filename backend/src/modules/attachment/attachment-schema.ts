import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { evolutionContract } from '#/core/schema-evolution/evolution-contract';
import { createInsertSchema, createSelectSchema, describeFields } from '#/db/utils/drizzle-schema';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import {
  attachmentPlacementFieldsSchema,
  validateAttachmentPlacement,
} from '#/modules/attachment/helpers/attachment-placement';
import { productViewCountSchema } from '#/modules/entities/entities-schema';
import { batchResponseSchema, maxLength, paginationQuerySchema, stxBaseSchema, validUuidSchema } from '#/schemas';
import { nullableUserMinimalBaseSchema } from '#/schemas/minimal-base';
import { mockAttachmentResponse } from './attachment-mocks';

/** The single place the storage-key variant set is enumerated. `original` is always present. */
export const attachmentKeysSchema = z.object({
  original: z.string(),
  preview: z.string().optional(),
  thumbnail: z.string().optional(),
  converted: z.string().optional(),
});
export type AttachmentKeys = z.infer<typeof attachmentKeysSchema>;

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
    // The column defaults to {}, making `keys` optional on the generated insert schema; a create
    // must carry at least the original key.
    keys: attachmentKeysSchema,
    // Placement seam: apps exposing channel placement add their deepest-home-id fields here.
    ...attachmentPlacementFieldsSchema,
  });

export const attachmentContract = evolutionContract.product('attachment', {
  createItem: attachmentCreateBodySchema,
  updateOps: {
    name: z.string().max(maxLength.field),
  },
});

export const attachmentCreateManyStxBodySchema = attachmentContract.createItemSchema
  .array()
  .min(1)
  .max(50)
  // Placement seam: per-item validation (e.g. ambiguous home ids); a no-op with no placement fields.
  .superRefine((items, ctx) => {
    items.forEach((item, index) => {
      const issue = validateAttachmentPlacement(item);
      if (issue) ctx.addIssue({ code: 'custom', path: [index, ...issue.path], message: issue.message });
    });
  });

export const attachmentUpdateStxBodySchema = attachmentContract.updateBodySchema;

export const attachmentCreateResponseSchema = batchResponseSchema(attachmentSchema);

const attachmentSortKeys = attachmentSelectSchema.keyof().extract(['name', 'createdAt', 'contentType']);

export const attachmentListQuerySchema = paginationQuerySchema.extend({
  sort: attachmentSortKeys.default('createdAt').optional(),
  // Placement seam: narrow to rows homed at one channel (resolved by `resolveAttachmentHomeScope`);
  // omitted or the organization itself reads org-wide.
  channelId: validUuidSchema.optional(),
});

/** Selectable stored-file variants. Mirrors the frontend `BlobVariant`. */
export const attachmentVariantSchema = z.enum(['original', 'preview', 'thumbnail', 'converted']);

/**
 * Callers reference private attachments by `attachmentId` plus `variant`; clients never submit
 * storage keys. The server resolves the owning rows under RLS and permission, and fails closed
 * before signing. Public media is served from the CDN and never reaches this endpoint.
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

/** Missing and denied ids collapse into one `rejectedIds` list, so the two are indistinguishable. */
export const presignedUrlItemSchema = z.object({
  attachmentId: validUuidSchema,
  variant: attachmentVariantSchema,
  url: z.string(),
});
