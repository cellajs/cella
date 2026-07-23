import type { UploadTemplateId } from 'shared';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { env } from '#/env';
import { getParams, getSignature } from '#/lib/transloadit';

interface GetUploadTokenOpts {
  publicBucket: boolean;
  organizationId?: string;
  templateId: UploadTemplateId;
}

export function getUploadTokenOp(ctx: AuthContext, { publicBucket, organizationId, templateId }: GetUploadTokenOpts) {
  const user = ctx.var.user;

  const sub = [organizationId, user.id].filter((part): part is string => typeof part === 'string').join('/');

  if (!env.TRANSLOADIT_KEY || !env.TRANSLOADIT_SECRET) {
    return { sub, publicBucket, s3: !!env.S3_ACCESS_KEY_ID, params: null, signature: null };
  }

  try {
    const params = getParams(templateId, publicBucket, sub);
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
