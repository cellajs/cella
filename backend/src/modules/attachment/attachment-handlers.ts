import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { attachmentRoutes } from '#/modules/attachment/attachment-routes';
import { createAttachmentsOp } from '#/modules/attachment/operations/create-attachments';
import { deleteAttachmentsOp } from '#/modules/attachment/operations/delete-attachments';
import { getAttachmentOp } from '#/modules/attachment/operations/get-attachment';
import { getAttachmentsOp } from '#/modules/attachment/operations/get-attachments';
import { getPresignedUrlsOp } from '#/modules/attachment/operations/get-presigned-urls';
import { linkAttachmentKeysOp } from '#/modules/attachment/operations/link-attachment-keys';
import { updateAttachmentOp } from '#/modules/attachment/operations/update-attachment';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(attachmentRoutes.getAttachments, async (ctx) => {
  const result = await getAttachmentsOp(ctx, ctx.req.valid('query'));
  return ctx.json(result, 200);
});

app.openapi(attachmentRoutes.getPresignedUrls, async (ctx) => {
  const result = await getPresignedUrlsOp(ctx, ctx.req.valid('json'));
  return ctx.json(result, 200);
});

app.openapi(attachmentRoutes.getAttachment, async (ctx) => {
  const { id } = ctx.req.valid('param');
  const result = await getAttachmentOp(ctx, id);
  ctx.set('productCacheData', result);
  return ctx.json(result, 200);
});

app.openapi(attachmentRoutes.createAttachments, async (ctx) => {
  const { created, ...result } = await createAttachmentsOp(ctx, ctx.req.valid('json'));
  return ctx.json(result, created ? 201 : 200);
});

app.openapi(attachmentRoutes.updateAttachment, async (ctx) => {
  const { id } = ctx.req.valid('param');
  // `fullResponse` in the query is accepted and ignored: audit fields are resolved for every response shape.
  const result = await updateAttachmentOp(ctx, id, ctx.req.valid('json'), {});
  return ctx.json(result, 200);
});

app.openapi(attachmentRoutes.linkAttachmentKeys, async (ctx) => {
  const { id } = ctx.req.valid('param');
  const result = await linkAttachmentKeysOp(ctx, id, ctx.req.valid('json'));
  return ctx.json(result, 200);
});

app.openapi(attachmentRoutes.deleteAttachments, async (ctx) => {
  const { ids } = ctx.req.valid('json');
  const result = await deleteAttachmentsOp(ctx, ids);
  return ctx.json(result, 200);
});

export const attachmentHandlers = app;
