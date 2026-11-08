import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { getPublicPresignedUrlsOp } from '#/modules/attachment/operations/get-presigned-urls';
import { publicAttachmentRoutes } from '#/modules/attachment/public-routes';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(publicAttachmentRoutes.presignPublicAttachmentUrls, async (ctx) =>
  ctx.json(await getPublicPresignedUrlsOp(ctx.req.valid('param'), ctx.req.valid('json')), 200),
);

export const publicAttachmentHandlers = app;
