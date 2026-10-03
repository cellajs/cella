import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { baseDb } from '#/db/db';
import { type ActivityEvent, activityBus, getEventData } from '#/lib/activity-bus';
import { createRequestOp } from '#/modules/requests/operations/create-request';
import { deleteRequestsOp } from '#/modules/requests/operations/delete-requests';
import { getRequestsOp } from '#/modules/requests/operations/get-requests';
import { stampWaitlistRequestInvited } from '#/modules/requests/requests-queries';
import { requestRoutes } from '#/modules/requests/requests-routes';
import { defaultHook } from '#/utils/default-hook';
import { log } from '#/utils/logger';

// ActivityBus: an invitation to an address no account holds answers that address's waitlist request
activityBus.on('inactive_membership.created', async (event: ActivityEvent) => {
  const membership = getEventData(event, 'inactive_membership');
  if (!membership?.email || membership.userId) return;

  try {
    await stampWaitlistRequestInvited({ var: { db: baseDb } }, { email: membership.email });
  } catch (error) {
    log.error('Failed to stamp waitlist request as invited', { error, email: membership.email });
  }
});

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(requestRoutes.createRequest, async (ctx) => {
  await createRequestOp(ctx, ctx.req.valid('json'));
  return ctx.body(null, 204);
});

app.openapi(requestRoutes.getRequests, async (ctx) => {
  const data = await getRequestsOp(ctx, ctx.req.valid('query'));
  return ctx.json(data, 200);
});

app.openapi(requestRoutes.deleteRequests, async (ctx) => {
  const { ids } = ctx.req.valid('json');
  const data = await deleteRequestsOp(ctx, Array.isArray(ids) ? ids : [ids]);
  return ctx.json(data, 200);
});

export const requestHandlers = app;
