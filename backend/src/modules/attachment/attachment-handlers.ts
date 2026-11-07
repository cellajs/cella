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
import { readListPage } from '#/utils/list-page';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(attachmentRoutes.listAttachments, async (ctx) => {
  const query = ctx.req.valid('query');
  return ctx.json(await readListPage(ctx, query, (page) => getAttachmentsOp(ctx, query, page)), 200);
});

app.openapi(attachmentRoutes.presignAttachmentUrls, async (ctx) => {
  return ctx.json(await getPresignedUrlsOp(ctx, ctx.req.valid('json')), 200);
});

app.openapi(attachmentRoutes.getAttachment, async (ctx) => {
  return ctx.json(await getAttachmentOp(ctx, ctx.req.valid('param').attachmentId), 200);
});

app.openapi(attachmentRoutes.batchCreateAttachments, async (ctx) => {
  const { created, ...result } = await createAttachmentsOp(ctx, ctx.req.valid('json'));
  return ctx.json(result, created ? 201 : 200);
});

app.openapi(attachmentRoutes.updateAttachment, async (ctx) => {
  return ctx.json(await updateAttachmentOp(ctx, ctx.req.valid('param').attachmentId, ctx.req.valid('json')), 200);
});

app.openapi(attachmentRoutes.linkAttachmentKeys, async (ctx) => {
  return ctx.json(await linkAttachmentKeysOp(ctx, ctx.req.valid('param').attachmentId, ctx.req.valid('json')), 200);
});

app.openapi(attachmentRoutes.batchDeleteAttachments, async (ctx) => {
  const { ids, stx } = ctx.req.valid('json');
  return ctx.json(await deleteAttachmentsOp(ctx, ids, stx), 200);
});

export const attachmentHandlers = app;
