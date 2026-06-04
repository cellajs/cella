import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { assertSuccess } from '#/core/operation-result';
import attachmentRoutes from '#/modules/attachment/attachment-routes';
import '#/modules/attachment/attachment-module';
import { createAttachmentsOp } from '#/modules/attachment/operations/create-attachments';
import { deleteAttachmentsOp } from '#/modules/attachment/operations/delete-attachments';
import { getAttachmentOp } from '#/modules/attachment/operations/get-attachment';
import { getAttachmentsOp } from '#/modules/attachment/operations/get-attachments';
import { getPresignedUrlOp } from '#/modules/attachment/operations/get-presigned-url';
import { updateAttachmentOp } from '#/modules/attachment/operations/update-attachment';
import { canPerEntityType } from '#/permissions';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(attachmentRoutes.getAttachments, async (ctx) => {
  const query = ctx.req.valid('query');
  canPerEntityType(ctx, 'read', {
    entityType: 'attachment',
    organizationId: ctx.var.organization.id,
  });
  const result = await getAttachmentsOp(ctx, query);
  assertSuccess(result, 'attachment');
  return ctx.json(result.data, 200);
});

app.openapi(attachmentRoutes.getPresignedUrl, async (ctx) => {
  const { key } = ctx.req.valid('query');
  const result = await getPresignedUrlOp(ctx, key);
  assertSuccess(result, 'attachment');
  return ctx.json(result.data, 200);
});

app.openapi(attachmentRoutes.getAttachment, async (ctx) => {
  const { id } = ctx.req.valid('param');
  const result = await getAttachmentOp(ctx, id);
  assertSuccess(result, 'attachment');
  ctx.set('entityCacheData', result.data as Record<string, unknown>);
  return ctx.json(result.data, 200);
});

app.openapi(attachmentRoutes.createAttachments, async (ctx) => {
  const result = await createAttachmentsOp(ctx, ctx.req.valid('json'));
  assertSuccess(result, 'attachment');
  return ctx.json(result.data, 201);
});

app.openapi(attachmentRoutes.updateAttachment, async (ctx) => {
  const { id } = ctx.req.valid('param');
  const { fullResponse } = ctx.req.valid('query');
  const result = await updateAttachmentOp(ctx, id, ctx.req.valid('json'), { fullResponse });
  assertSuccess(result, 'attachment');
  return ctx.json(result.data, 200);
});

app.openapi(attachmentRoutes.deleteAttachments, async (ctx) => {
  const { ids } = ctx.req.valid('json');
  const result = await deleteAttachmentsOp(ctx, Array.isArray(ids) ? ids : [ids]);
  assertSuccess(result, 'attachment');
  return ctx.json(result.data, 200);
});

export const attachmentHandlers = app;
