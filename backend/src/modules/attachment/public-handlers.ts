import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { getPublicPresignedUrlsOp } from '#/modules/attachment/operations/get-presigned-urls';
import { publicAttachmentRoutes } from '#/modules/attachment/public-routes';

const app = new OpenAPIHono<Env>();

app.openapi(publicAttachmentRoutes.presignPublicAttachmentUrls, async (ctx) =>
  ctx.json(await getPublicPresignedUrlsOp(ctx.req.valid('param'), ctx.req.valid('json')), 200),
);

export const publicAttachmentHandlers = app;
