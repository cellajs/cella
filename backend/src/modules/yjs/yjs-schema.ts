import { z } from '@hono/zod-openapi';
import { yjsHttpChunkBytes, yjsMaxServerRowIds } from '#/modules/yjs/helpers/yjs-log';
import { productEntityTypeSchema, validIdSchema, validUuidSchema } from '#/schemas';

/** The length of `bytes` bytes as unpadded base64url. */
const base64urlLength = (bytes: number) => Math.ceil((bytes * 4) / 3);

/** A Yjs binary, an update or a state vector, in a JSON body: unpadded base64url. */
const yjsBytesSchema = z.base64url();

/** The collaborative document of one product entity. */
const yjsDocumentSchema = z.object({ entityType: productEntityTypeSchema, entityId: validIdSchema });

export const yjsTokenQuerySchema = yjsDocumentSchema;

export const yjsTokenResponseSchema = z.object({ token: z.string() });

export const yjsPullBodySchema = yjsDocumentSchema.extend({
  /** About 8 bytes per client that ever edited the document; 256K characters hold some 24,000 of them. */
  stateVector: yjsBytesSchema.max(262_144).describe("The caller's state vector: the answer carries what it lacks"),
});

export const yjsPullResponseSchema = z.object({
  generation: z.uuid().describe("The document's generation: another one than the caller holds means the server reseeded it"),
  update: yjsBytesSchema.describe("What the caller's state vector lacks, as one Yjs update"),
  stateVector: yjsBytesSchema.describe("The server's state vector, so the caller can post what the server lacks"),
});

export const yjsPushBodySchema = yjsDocumentSchema.extend({
  generation: z.uuid().describe('The generation the update was made in'),
  update: yjsBytesSchema.max(base64urlLength(yjsHttpChunkBytes)).describe('One Yjs update of at most 512 KB'),
});

export const yjsPushResponseSchema = z.object({
  status: z.enum(['appended', 'empty']).describe('`appended` once the update is logged; `empty` when it carried nothing the document lacked'),
});

/** The body the relay posts to the internal materialize route, which is out of the spec. */
export const yjsMaterializeBodySchema = z.object({
  entityType: productEntityTypeSchema,
  entityId: validUuidSchema,
  tenantId: validIdSchema,
  organizationId: z.union([validUuidSchema, z.null()]),
  description: z.string(),
  /** The log's senders, newest first; the relay sends at most 20. */
  editors: z.array(validUuidSchema).min(1).max(50),
  /**
   * The window's server-origin rows, ids only, so the body stays small at the cap; absent reads as none, so a relay
   * that sends none gets 409 for a window that holds one.
   */
  serverRowIds: z.array(z.number().int()).max(yjsMaxServerRowIds).default([]),
});
