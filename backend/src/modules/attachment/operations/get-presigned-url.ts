import { appConfig } from 'shared';
import type { AuthContext } from '#/core/context';
import type { OperationResult } from '#/core/operation-result';
import { tenantRead } from '#/db/tenant-context';
import { findAttachmentByKey } from '#/modules/attachment/attachment-queries';
import { getSignedUrlFromKey } from '#/modules/attachment/helpers/signed-url';
import { checkPermission } from '#/permissions';
import { actorFrom } from '#/permissions/actor';
import { buildSubjectFromEntity } from '#/permissions/build-subject';

export async function getPresignedUrlOp(ctx: AuthContext, key: string): Promise<OperationResult<string>> {
  const attachment = await tenantRead(ctx, async (readCtx) => {
    return findAttachmentByKey(readCtx, { key });
  });

  const bucketName = attachment?.bucketName ?? appConfig.s3.privateBucket;

  if (attachment) {
    // The actor carries the system-admin bypass, so `isAllowed` is already the final verdict.
    const subject = buildSubjectFromEntity('attachment', attachment);
    const { isAllowed } = checkPermission(ctx.var.memberships, 'read', subject, actorFrom(ctx));

    if (!isAllowed) return { success: false, error: 'forbidden', status: 403 };
  }

  const url = await getSignedUrlFromKey(key, { bucketName, isPublic: false });

  return { success: true, data: url };
}
