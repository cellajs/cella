import { OpenAPIHono } from '@hono/zod-openapi';
import { streamSSE } from 'hono/streaming';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { cdcWebSocketServer } from '#/lib/cdc-websocket';
import '#/modules/entities/entities-listeners';
import { entityRoutes } from '#/modules/entities/entities-routes';
import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import { appCatchupOp, getLatestActivityId } from '#/modules/entities/operations/app-catchup';
import { checkSlugOp } from '#/modules/entities/operations/check-slug';
import { ensureAppStreamSessionSweep } from '#/modules/entities/operations/stream-session-sweep';
import { keepAlive, workerAwayPing, writeOffset } from '#/modules/entities/stream/helpers';
import { organizationTopic, streamSubscriberManager, userTopic } from '#/modules/entities/stream/subscriber-manager';
import { defaultHook } from '#/utils/default-hook';
import { log } from '#/utils/logger';
import { isSystemAccessAllowed } from '#/utils/system-access';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(entityRoutes.checkSlug, async (ctx) => {
  const { slug, entityType } = ctx.req.valid('json');
  const result = await checkSlugOp(ctx, slug, entityType);
  return result.available ? ctx.body(null, 204) : ctx.body(null, 409);
});

// Caps bound memory and dispatch CPU for the single-process stream; both reject with 429 so
// clients use their normal reconnect backoff.
const maxStreamsPerUser = 10;
const maxStreamSubscribers = 5000;

app.openapi(entityRoutes.appStream, async (ctx) => {
  const { user, memberships, isSystemAdmin, sessionId } = ctx.var;

  if (streamSubscriberManager.size >= maxStreamSubscribers || streamSubscriberManager.getByTopic(userTopic(user.id)).length >= maxStreamsPerUser) {
    throw new AppError(429, 'too_many_requests', 'warn', { meta: { reason: 'stream_subscriber_cap' } });
  }

  const organizationIds = new Set(memberships.map((membership) => membership.organizationId));
  const cursor = await getLatestActivityId(ctx, organizationIds);

  return streamSSE(ctx, async (stream) => {
    await writeOffset(stream, cursor);

    const subscriber: AppStreamSubscriber = {
      id: crypto.randomUUID(),
      topic: userTopic(user.id),
      stream,
      userId: user.id,
      sessionId,
      organizationIds,
      isSystemAdmin,
      systemAccessAllowed: isSystemAccessAllowed(ctx),
      memberships,
    };

    // The user topic carries self-membership events whatever organizations it registered on, so a membership in a new
    // organization reaches the user here and the client reconnects to register on it.
    streamSubscriberManager.register(subscriber, [...organizationIds].map(organizationTopic));
    ensureAppStreamSessionSweep();
    log.debug('App stream subscriber registered', { subscriberId: subscriber.id, orgCount: organizationIds.size });

    stream.onAbort(() => {
      streamSubscriberManager.unregister(subscriber.id);
      log.debug('App stream subscriber disconnected', { subscriberId: subscriber.id });
    });

    // Every ping says whether a CDC worker reads: without one, live changes are late and the client falls back to a stale time.
    await keepAlive(stream, () => (cdcWebSocketServer.isWorkerAway() ? workerAwayPing : ''));
    // biome-ignore lint/suspicious/noExplicitAny: streamSSE returns Response, not TypedResponse expected by OpenAPI handler
  }) as any;
});

app.openapi(entityRoutes.appCatchup, async (ctx) => {
  const result = await appCatchupOp(ctx, ctx.req.valid('json'));
  return ctx.json(result, 200);
});

export const entityHandlers = app;
