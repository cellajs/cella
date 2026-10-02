import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { getYjsTokenOp } from '#/modules/yjs/operations/get-yjs-token';
import { pullYjsDocumentOp } from '#/modules/yjs/operations/pull-yjs-document';
import { pushYjsUpdateOp } from '#/modules/yjs/operations/push-yjs-update';
import { yjsRoutes } from '#/modules/yjs/yjs-routes';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

/** A Yjs binary from its JSON form: the schema checked the base64url alphabet. */
const fromBase64url = (value: string) => new Uint8Array(Buffer.from(value, 'base64url'));

const toBase64url = (bytes: Uint8Array) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64url');

app.openapi(yjsRoutes.getYjsToken, async (ctx) => {
  const data = await getYjsTokenOp(ctx, ctx.req.valid('query'));
  return ctx.json(data, 200);
});

app.openapi(yjsRoutes.pullYjsDocument, async (ctx) => {
  const { stateVector, ...doc } = ctx.req.valid('json');
  const pulled = await pullYjsDocumentOp(ctx, { ...doc, stateVector: fromBase64url(stateVector) });
  return ctx.json({ generation: pulled.generation, update: toBase64url(pulled.update), stateVector: toBase64url(pulled.stateVector) }, 200);
});

app.openapi(yjsRoutes.pushYjsUpdate, async (ctx) => {
  const { update, ...body } = ctx.req.valid('json');
  const data = await pushYjsUpdateOp(ctx, { ...body, update: fromBase64url(update) });
  return ctx.json(data, 200);
});

export const yjsHandlers = app;
