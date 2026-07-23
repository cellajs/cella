import type { z } from '@hono/zod-openapi';
import type { AuthContext } from '#/core/context';
import type { OperationResult } from '#/core/operation-result';
import { tenantRead } from '#/db/tenant-context';
import type { AttachmentModel } from '#/modules/attachment/attachment-db';
import { findAttachmentsByIds } from '#/modules/attachment/attachment-queries';
import type {
  attachmentVariantSchema,
  presignedUrlItemSchema,
  presignedUrlsBodySchema,
} from '#/modules/attachment/attachment-schema';
import { getSignedUrlFromKey } from '#/modules/attachment/helpers/signed-url';
import { checkAccessBatch } from '#/permissions';
import { accessFrom } from '#/permissions/access';
import { buildSubjectFromEntity } from '#/permissions/build-subject';

type PresignedUrlsBody = z.infer<typeof presignedUrlsBodySchema>;
type PresignedUrlItem = z.infer<typeof presignedUrlItemSchema>;
type AttachmentVariant = z.infer<typeof attachmentVariantSchema>;

interface PresignedUrlsResult {
  data: PresignedUrlItem[];
  rejectedIds: string[];
}

/**
 * Key to sign for a variant, resolved from the row only (never client input).
 * Variants that were never generated fall back to the always-present original key.
 */
const selectVariantKey = (attachment: AttachmentModel, variant: AttachmentVariant): string => {
  if (variant === 'thumbnail') return attachment.thumbnailKey ?? attachment.originalKey;
  if (variant === 'converted') return attachment.convertedKey ?? attachment.originalKey;
  return attachment.originalKey;
};

/**
 * Sign private-bucket download URLs for up to 50 attachments the caller may read.
 *
 * Fails closed: rows resolve under tenant RLS and are permission-checked in one
 * batch before anything is signed. Missing and denied ids merge into a uniform
 * `rejectedIds` list with no reason split, so the response is not an existence
 * oracle. Succeeds even when every item is rejected.
 */
export async function getPresignedUrlsOp(
  ctx: AuthContext,
  { items }: PresignedUrlsBody,
): Promise<OperationResult<PresignedUrlsResult>> {
  const pairs = new Map<string, { attachmentId: string; variant: AttachmentVariant }>();
  for (const { attachmentId, variant } of items) {
    pairs.set(`${attachmentId}:${variant}`, { attachmentId, variant });
  }
  const ids = [...new Set(items.map((item) => item.attachmentId))];

  const rows = await tenantRead(ctx, (readCtx) => findAttachmentsByIds(readCtx, { ids }));
  const rowById = new Map(rows.map((row) => [row.id, row]));

  // The actor carries the system-admin bypass, so `allowed` is already the final verdict.
  const subjects = rows.map((row) => buildSubjectFromEntity('attachment', row));
  const { results } = checkAccessBatch(accessFrom(ctx), 'read', subjects);

  const allowedPairs = [...pairs.values()].flatMap((pair) => {
    const row = rowById.get(pair.attachmentId);
    return row && results.get(pair.attachmentId)?.allowed ? [{ ...pair, row }] : [];
  });
  const rejectedIds = ids.filter((id) => !rowById.has(id) || !results.get(id)?.allowed);

  const data = await Promise.all(
    allowedPairs.map(async ({ attachmentId, variant, row }) => {
      const key = selectVariantKey(row, variant);
      const url = await getSignedUrlFromKey(key, { bucketName: row.bucketName, publicBucket: false });
      return { attachmentId, variant, url };
    }),
  );

  return { success: true, data: { data, rejectedIds } };
}
