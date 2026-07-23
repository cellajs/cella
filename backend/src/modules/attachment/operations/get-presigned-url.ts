import type { z } from '@hono/zod-openapi';
import type { AuthContext } from '#/core/context';
import type { OperationResult } from '#/core/operation-result';
import { tenantRead } from '#/db/tenant-context';
import type { AttachmentModel } from '#/modules/attachment/attachment-db';
import { findAttachmentById } from '#/modules/attachment/attachment-queries';
import type { attachmentVariantSchema, presignedUrlQuerySchema } from '#/modules/attachment/attachment-schema';
import { getSignedUrlFromKey } from '#/modules/attachment/helpers/signed-url';
import { checkAccess } from '#/permissions';
import { accessFrom } from '#/permissions/actor';
import { buildSubjectFromEntity } from '#/permissions/build-subject';

type PresignedUrlQuery = z.infer<typeof presignedUrlQuerySchema>;
type AttachmentVariant = z.infer<typeof attachmentVariantSchema>;

/**
 * Pick the key to sign from the resolved row (never from client input). Falls
 * back to the always-present original key when the requested variant was never
 * generated, so an inline reference never 404s on a missing thumbnail/converted.
 */
const selectVariantKey = (attachment: AttachmentModel, variant: AttachmentVariant): string => {
  if (variant === 'thumbnail') return attachment.thumbnailKey ?? attachment.originalKey;
  if (variant === 'converted') return attachment.convertedKey ?? attachment.originalKey;
  return attachment.originalKey;
};

/**
 * Sign a private-bucket download URL for an attachment the caller may read.
 *
 * Fails closed: the row is resolved under tenant RLS and permission-checked
 * before anything is signed, so an unknown or cross-tenant id yields 404 and the
 * signer is never reached. The caller references the attachment by id + variant;
 * only that row's key is signed. Public media is served from the CDN and never
 * reaches this endpoint.
 */
export async function getPresignedUrlOp(
  ctx: AuthContext,
  { attachmentId, variant }: PresignedUrlQuery,
): Promise<OperationResult<string>> {
  const attachment = await tenantRead(ctx, (readCtx) => findAttachmentById(readCtx, { id: attachmentId }));

  // Fail closed: no row means no permission to sign anything.
  if (!attachment) return { success: false, error: 'not_found', status: 404 };

  // The actor carries the system-admin bypass, so `isAllowed` is already the final verdict.
  const subject = buildSubjectFromEntity('attachment', attachment);
  const { isAllowed } = checkAccess(accessFrom(ctx), 'read', subject);
  if (!isAllowed) return { success: false, error: 'forbidden', status: 403 };

  const key = selectVariantKey(attachment, variant);
  const url = await getSignedUrlFromKey(key, { bucketName: attachment.bucketName, publicBucket: false });

  return { success: true, data: url };
}
