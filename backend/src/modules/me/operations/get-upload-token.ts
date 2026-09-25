import type { UploadTemplateId } from 'shared';
import { isPublicUploadTemplate, isSystemUploadTemplate, systemUploadPrefix } from 'shared/utils/upload-visibility';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { env } from '#/env';
import { getParams, getSignature } from '#/lib/transloadit';

interface GetUploadTokenOpts {
  organizationId?: string;
  templateId: UploadTemplateId;
}

/** A system upload (newsletter images) belongs to no organization and is stored under the system prefix. */
const systemUploadSub = (ctx: UserContext) => {
  if (!ctx.var.isSystemAdmin) throw new AppError(403, 'no_sysadmin', 'warn', { meta: { user: ctx.var.user.id } });
  return `${systemUploadPrefix}/${ctx.var.user.id}`;
};

/** The organization id becomes the upload's storage prefix, which attachments must name: members only. */
const organizationUploadSub = (ctx: UserContext, organizationId?: string) => {
  const isMember = ctx.var.memberships.some((membership) => membership.organizationId === organizationId);
  if (organizationId && !isMember && !ctx.var.isSystemAdmin) {
    throw new AppError(403, 'forbidden', 'warn', { entityType: 'organization' });
  }
  return [organizationId, ctx.var.user.id].filter((part): part is string => typeof part === 'string').join('/');
};

/**
 * Signs an upload under `<organizationId>/<userId>`, or under the system prefix for a system template. The template
 * decides the bucket and ACL: an avatar, banner or newsletter image is public by design, an attachment (any file type,
 * HTML and SVG included) is private.
 */
export function getUploadTokenOp(ctx: UserContext, { organizationId, templateId }: GetUploadTokenOpts) {
  const publicBucket = isPublicUploadTemplate(templateId);

  const sub = isSystemUploadTemplate(templateId) ? systemUploadSub(ctx) : organizationUploadSub(ctx, organizationId);

  if (!env.TRANSLOADIT_KEY || !env.TRANSLOADIT_SECRET) {
    return { sub, publicBucket, s3: !!env.S3_ACCESS_KEY_ID, params: null, signature: null };
  }

  try {
    const params = getParams(templateId, sub);
    const paramsString = JSON.stringify(params);
    const signature = getSignature(paramsString);
    return { sub, publicBucket, s3: !!env.S3_ACCESS_KEY_ID, params, signature };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(500, 'auth_key_not_found', 'error', {
      ...(error instanceof Error ? { originalError: error } : {}),
    });
  }
}
