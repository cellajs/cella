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

/**
 * Streams per user id that passed the caps and are not registered yet: two awaits lie between the check and the
 * registration, so the per-user cap counts them too, and parallel connects cannot all pass it.
 */
const admittedStreams = new Map<string, number>();

/** Gives back one admitted stream of `userId`, at its registration or when it fails before one. */
function releaseAdmission(userId: string): void {
  const left = (admittedStreams.get(userId) ?? 1) - 1;
  if (left > 0) admittedStreams.set(userId, left);
  else admittedStreams.delete(userId);
}

app.openapi(entityRoutes.appStream, async (ctx) => {
  const { user, memberships, isSystemAdmin, sessionId } = ctx.var;

  const admitted = admittedStreams.get(user.id) ?? 0;
  if (
    streamSubscriberManager.size >= maxStreamSubscribers ||
    streamSubscriberManager.getByTopic(userTopic(user.id)).length + admitted >= maxStreamsPerUser
  ) {
    throw new AppError(429, 'too_many_requests', 'warn', { meta: { reason: 'stream_subscriber_cap' } });
  }
  admittedStreams.set(user.id, admitted + 1);

  const organizationIds = new Set(memberships.map((membership) => membership.organizationId));
  const cursor = await getLatestActivityId(ctx, organizationIds).catch((error) => {
    releaseAdmission(user.id);
    throw error;
  });

  return streamSSE(ctx, async (stream) => {
    // The registration below follows in the same tick, so the stream is counted throughout.
    try {
      await writeOffset(stream, cursor);
    } finally {
      releaseAdmission(user.id);
    }

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
