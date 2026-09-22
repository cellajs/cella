import { z } from '@hono/zod-openapi';
import { textFromDocument } from 'shared/utils/text-from-block';
import { uuidv7 } from 'uuidv7';
import { createServerStx } from '#/core/stx/create-server-stx';
import { maxLength } from '#/db/utils/constraints';
import { attachmentRoutes } from '#/modules/attachment/attachment-routes';
import { attachmentContract } from '#/modules/attachment/attachment-schema';
import { createAttachmentsOp } from '#/modules/attachment/operations/create-attachments';
import { deleteAttachmentsOp } from '#/modules/attachment/operations/delete-attachments';
import { getAttachmentOp } from '#/modules/attachment/operations/get-attachment';
import { getAttachmentsOp } from '#/modules/attachment/operations/get-attachments';
import { updateAttachmentOp } from '#/modules/attachment/operations/update-attachment';
import { defineTool } from '#/modules/mcp/define-tool';
import { validUuidSchema } from '#/schemas';

/** What a model sees of an attachment: metadata plus the description as text, never the block document. */
function summarize(row: { description?: string | null; [key: string]: unknown }) {
  const { description, keywords: _keywords, mentions: _mentions, keys: _keys, ...rest } = row;
  return { ...rest, descriptionText: textFromDocument(typeof description === 'string' ? description : null) ?? '' };
}

const entity = 'attachment';

/**
 * The template's MCP showcase (AUTH_SUBSTRATE_PLAN Phase E): the attachment operations as tools, read tools under
 * `attachment:read`, write tools under `attachment:write`. Inputs are model-shaped (plain fields, no sync
 * transaction); the bindings build the trusted server metadata and call the same operations the REST handlers use.
 */
export const attachmentTools = [
  defineTool(attachmentRoutes.getAttachments, {
    entity,
    // Model-shaped: JSON numbers, not the query-string coercions of the REST route.
    inputSchema: z.object({
      q: z.string().max(maxLength.field).optional().describe('Search in name and keywords'),
      sort: z.enum(['name', 'createdAt', 'contentType']).default('createdAt'),
      order: z.enum(['asc', 'desc']).default('desc'),
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
      channelId: validUuidSchema.optional().describe('Narrow to one channel; omitted reads the organization'),
    }),
    execute: async (ctx, input) => {
      const { items, total } = await getAttachmentsOp(ctx, input);
      return { items: items.map(summarize), total };
    },
  }),
  defineTool(attachmentRoutes.getAttachment, {
    entity,
    inputSchema: z.object({ id: validUuidSchema.describe('Attachment id') }),
    execute: async (ctx, { id }) => summarize(await getAttachmentOp(ctx, id)),
  }),
  defineTool(attachmentRoutes.createAttachments, {
    entity,
    inputSchema: z.object({
      items: z
        .array(
          z.object({
            name: z.string().max(maxLength.field).describe('Display name'),
            filename: z.string().max(maxLength.field),
            contentType: z.string().max(maxLength.field).describe('MIME type'),
            size: z.number().int().nonnegative().describe('Size in bytes'),
            key: z.string().max(maxLength.field).describe('Storage key of the already uploaded original'),
            publicBucket: z.boolean().default(false),
          }),
        )
        .min(1)
        .max(50),
    }),
    execute: async (ctx, { items }) => {
      // Placement seam: the template homes attachments at the organization (from ctx); apps with deeper homes take their ids as input.
      const input = items.map((item) =>
        attachmentContract.createItemSchema.parse({
          id: uuidv7(),
          name: item.name,
          filename: item.filename,
          contentType: item.contentType,
          size: String(item.size),
          keys: { original: item.key },
          bucketName: item.publicBucket ? 'public' : 'attachments',
          publicBucket: item.publicBucket,
          stx: createServerStx(),
        }),
      );
      const { data, rejectedIds } = await createAttachmentsOp(ctx, input);
      return { items: data.map(summarize), rejectedIds };
    },
  }),
  defineTool(attachmentRoutes.updateAttachment, {
    entity,
    inputSchema: z.object({
      id: validUuidSchema,
      name: z.string().max(maxLength.field).optional().describe('New display name'),
      description: z.string().max(maxLength.html).optional().describe('New description as a BlockNote document (JSON)'),
    }),
    execute: async (ctx, { id, name, description }) => {
      const ops = { ...(name !== undefined && { name }), ...(description !== undefined && { description }) };
      return summarize(await updateAttachmentOp(ctx, id, { ops, stx: createServerStx() }, { serverOrigin: true }));
    },
  }),
  defineTool(attachmentRoutes.deleteAttachments, {
    entity,
    inputSchema: z.object({ ids: z.array(validUuidSchema).min(1).max(50) }),
    execute: (ctx, { ids }) => deleteAttachmentsOp(ctx, ids),
  }),
];
