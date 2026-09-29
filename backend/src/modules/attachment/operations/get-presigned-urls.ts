import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { tenantRead } from '#/db/tenant-context';
import type { AttachmentModel } from '#/modules/attachment/attachment-db';
import { findAttachmentsByIds } from '#/modules/attachment/attachment-queries';
import type {
  attachmentVariantSchema,
  presignedUrlItemSchema,
  presignedUrlsBodySchema,
} from '#/modules/attachment/attachment-schema';
import { getSignedUrlFromKey } from '#/modules/attachment/helpers/signed-url';
import { isSignableKey } from '#/modules/attachment/helpers/storage-key';
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

/** Resolved from the row, never client input; an ungenerated variant falls back to `original`. */
const selectVariantKey = (attachment: AttachmentModel, variant: AttachmentVariant): string =>
  attachment.keys[variant] ?? attachment.keys.original;

/**
 * Signs private-bucket download URLs for up to 50 attachments the caller may read.
 * Fails closed: rows resolve under tenant RLS and are permission-checked in one batch before
 * anything is signed. Missing and denied ids merge into one `rejectedIds` list, so the response
 * is not an existence oracle. Succeeds even when every item is rejected.
 */
export async function getPresignedUrlsOp(ctx: UserContext, { items }: PresignedUrlsBody): Promise<PresignedUrlsResult> {
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

  // A row naming storage outside its organization is refused like a denied one, whatever wrote it: an id is signed
  // for every requested variant or rejected whole.
  const unsignableIds = new Set(
    [...pairs.values()]
      .filter(({ attachmentId, variant }) => {
        const row = rowById.get(attachmentId);
        return row && !isSignableKey(selectVariantKey(row, variant), row.bucketName, row.organizationId);
      })
      .map(({ attachmentId }) => attachmentId),
  );
  const isSignable = (id: string) => rowById.has(id) && results.get(id)?.allowed === true && !unsignableIds.has(id);

  const allowedPairs = [...pairs.values()].flatMap((pair) => {
    const row = rowById.get(pair.attachmentId);
    return row && isSignable(pair.attachmentId) ? [{ ...pair, row }] : [];
  });
  const rejectedIds = ids.filter((id) => !isSignable(id));

  const data = await Promise.all(
    allowedPairs.map(async ({ attachmentId, variant, row }) => {
      const key = selectVariantKey(row, variant);
      const url = await getSignedUrlFromKey(key, { bucketName: row.bucketName, publicBucket: false });
      return { attachmentId, variant, url };
    }),
  );

  return { data, rejectedIds };
}
