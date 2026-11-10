import type { z } from '@hono/zod-openapi';
import { type Access, buildSubjectFromEntity, checkAccessBatch } from 'shared';
import type { ActorBinding, ActorContext } from '#/core/context';
import { tenantRead, tenantReadById } from '#/db/tenant-context';
import type { AttachmentModel } from '#/modules/attachment/attachment-db';
import { findAttachmentsByIds, findLiveAttachmentsIn } from '#/modules/attachment/attachment-queries';
import type {
  attachmentPresignedUrlSchema,
  attachmentPresignedUrlsBodySchema,
  attachmentVariantSchema,
} from '#/modules/attachment/attachment-schema';
import { getSignedUrlFromKey } from '#/modules/attachment/helpers/signed-url';
import { isSignableKey } from '#/modules/attachment/helpers/storage-key';
import { loadTenant } from '#/modules/tenants/load-tenant';
import { servesPublicly } from '#/modules/tenants/tenant-restrictions';
import { accessFrom } from '#/permissions/access';

type PresignedUrlsBody = z.infer<typeof attachmentPresignedUrlsBodySchema>;
type PresignedUrlItem = z.infer<typeof attachmentPresignedUrlSchema>;
type AttachmentVariant = z.infer<typeof attachmentVariantSchema>;

interface PresignedUrlsResult {
  results: PresignedUrlItem[];
  rejectedIds: string[];
}

/** Resolved from the row, never client input; an ungenerated variant falls back to `original`. */
const variantKeyOf = (attachment: AttachmentModel, variant: AttachmentVariant): string => attachment.keys[variant] ?? attachment.keys.original;

/**
 * The declared type of the object a variant resolves to: the row's for an original or a converted file; a preview or
 * thumbnail is an image the pipeline wrote, typed by its key's extension.
 */
const declaredTypeOf = (attachment: AttachmentModel, variant: AttachmentVariant): string | null => {
  const key = attachment.keys[variant];
  if (key === undefined || variant === 'original') return attachment.contentType;
  if (variant === 'converted') return attachment.convertedContentType;
  return `image/${key.slice(key.lastIndexOf('.') + 1)}`;
};

/** The name a download saves under: the row's filename, with the extension of the file the pipeline wrote for a variant. */
const filenameOf = (attachment: AttachmentModel, variant: AttachmentVariant): string => {
  const extension = /\.[a-z0-9]+$/i.exec(attachment.keys[variant] ?? '')?.[0];
  if (variant === 'original' || !extension) return attachment.filename;
  return attachment.filename.replace(/(\.[^.]*)?$/, extension);
};

const idsOf = (items: PresignedUrlsBody['items']) => [...new Set(items.map((item) => item.attachmentId))];

/**
 * Signs the requested variants of the `rows` that `access` may read, in one permission check before anything is
 * signed. Missing and denied ids merge into one `rejectedIds` list, so the response is not an existence oracle, and it
 * succeeds even when every item is rejected.
 */
async function signReadable(access: Access<ActorBinding>, rows: AttachmentModel[], items: PresignedUrlsBody['items']): Promise<PresignedUrlsResult> {
  const pairs = new Map<string, { attachmentId: string; variant: AttachmentVariant }>();
  for (const { attachmentId, variant } of items) pairs.set(`${attachmentId}:${variant}`, { attachmentId, variant });
  const ids = idsOf(items);
  const rowById = new Map(rows.map((row) => [row.id, row]));

  // The access carries the system-admin bypass, so `allowed` is already the final verdict.
  const subjects = rows.map((row) => buildSubjectFromEntity('attachment', row));
  const results = checkAccessBatch(access, 'read', subjects);

  // A row naming storage outside its organization is refused like a denied one, whatever wrote it: an id is signed
  // for every requested variant or rejected whole.
  const unsignableIds = new Set(
    [...pairs.values()]
      .filter(({ attachmentId, variant }) => {
        const row = rowById.get(attachmentId);
        return row && !isSignableKey(variantKeyOf(row, variant), row.bucketName, row.organizationId);
      })
      .map(({ attachmentId }) => attachmentId),
  );
  const isSignable = (id: string) => rowById.has(id) && results.get(id)?.allowed === true && !unsignableIds.has(id);

  const allowedPairs = [...pairs.values()].flatMap((pair) => {
    const row = rowById.get(pair.attachmentId);
    return row && isSignable(pair.attachmentId) ? [{ ...pair, row }] : [];
  });
  const rejectedIds = ids.filter((id) => !isSignable(id));

  const signed = await Promise.all(
    allowedPairs.map(async ({ attachmentId, variant, row }) => {
      const url = await getSignedUrlFromKey(variantKeyOf(row, variant), {
        bucketName: row.bucketName,
        contentType: declaredTypeOf(row, variant),
        filename: filenameOf(row, variant),
      });
      return { attachmentId, variant, url };
    }),
  );

  return { results: signed, rejectedIds };
}

/** Signs private-bucket download URLs for up to 50 attachments the caller may read; the rows resolve under tenant RLS. */
export async function getPresignedUrlsOp(ctx: ActorContext, { items }: PresignedUrlsBody): Promise<PresignedUrlsResult> {
  const rows = await tenantRead(ctx, (readCtx) => findAttachmentsByIds(readCtx, { ids: idsOf(items) }));
  return signReadable(accessFrom(ctx), rows, items);
}

/**
 * `getPresignedUrlsOp` for a caller without a sign-in: the rows are read in the organization the URL names, under its
 * tenant's RLS, and the engine decides as for any anonymous reader, whom the row's own `public` flag and the entity's
 * `publicRead()` grant alone let in. Without that grant, or in a tenant no public read serves (`servesPublicly`), every
 * id is rejected.
 */
export async function getPublicPresignedUrlsOp(
  { tenantId, organizationId }: { tenantId: string; organizationId: string },
  { items }: PresignedUrlsBody,
): Promise<PresignedUrlsResult> {
  const ids = idsOf(items);
  const tenant = await loadTenant(tenantId);
  if (!tenant || !servesPublicly(tenant)) return { results: [], rejectedIds: ids };

  const rows = await tenantReadById(tenantId, (tx) => findLiveAttachmentsIn({ var: { db: tx } }, { ids, tenantId, organizationId }));
  return signReadable({ anonymous: true }, rows, items);
}
