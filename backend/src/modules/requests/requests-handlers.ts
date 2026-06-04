import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import '#/modules/requests/requests-module';
import { baseDb } from '#/db/db';
import { type ActivityEvent, activityBus, getEventData } from '#/lib/activity-bus';
import { createRequestOp } from '#/modules/requests/operations/create-request';
import { deleteRequestsOp } from '#/modules/requests/operations/delete-requests';
import { getRequestsOp } from '#/modules/requests/operations/get-requests';
import { linkWaitlistRequest } from '#/modules/requests/requests-queries';
import requestRoutes from '#/modules/requests/requests-routes';
import { defaultHook } from '#/utils/default-hook';
import { logEvent } from '#/utils/logger';

// ============================================
// ActivityBus: link waitlist requests to invitation tokens
// ============================================
activityBus.on('inactive_membership.created', async (event: ActivityEvent) => {
  const membership = getEventData(event, 'inactive_membership');
  if (!membership?.tokenId || !membership.email) return;

  try {
    await linkWaitlistRequest({ var: { db: baseDb } }, { email: membership.email, tokenId: membership.tokenId });
  } catch (error) {
    logEvent(null, 'error', 'Failed to link waitlist request to token', { error, email: membership.email });
  }
});

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(requestRoutes.createRequest, async (ctx) => {
  const data = await createRequestOp(ctx, ctx.req.valid('json'));
  return ctx.json(data, 201);
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
