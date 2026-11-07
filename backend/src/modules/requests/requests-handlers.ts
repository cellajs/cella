import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { createRequestOp } from '#/modules/requests/operations/create-request';
import { deleteRequestsOp } from '#/modules/requests/operations/delete-requests';
import { getRequestsOp } from '#/modules/requests/operations/get-requests';
import { requestRoutes } from '#/modules/requests/requests-routes';
import { defaultHook } from '#/utils/default-hook';
import { readListPage } from '#/utils/list-page';
import { log } from '#/utils/logger';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(requestRoutes.createRequest, async (ctx) => {
  const input = ctx.req.valid('json');
  const stored = createRequestOp(ctx, input);
  // A waitlist or newsletter answer waits for nothing: its time would tell an address with an account, or one listed
  // already, from a new one. A contact message is stored alike for every address, so its sender hears when that fails.
  if (input.type === 'contact') await stored;
  else stored.catch((err) => log.error('Failed to store a request', { err }));
  return ctx.body(null, 204);
});

app.openapi(requestRoutes.listRequests, async (ctx) => {
  const query = ctx.req.valid('query');
  return ctx.json(await readListPage(ctx, query, (page) => getRequestsOp(ctx, query, page)), 200);
});

app.openapi(requestRoutes.batchDeleteRequests, async (ctx) => ctx.json(await deleteRequestsOp(ctx, ctx.req.valid('json').ids), 200));

export const requestHandlers = app;
