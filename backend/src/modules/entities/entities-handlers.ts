import { OpenAPIHono } from '@hono/zod-openapi';
import { streamSSE } from 'hono/streaming';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { assertSuccess } from '#/core/operation-result';
import '#/modules/entities/entities-listeners';
import '#/modules/entities/entities-module';
import { entityRoutes } from '#/modules/entities/entities-routes';
import { appCatchupOp, getLatestUserActivityId } from '#/modules/entities/operations/app-catchup';
import { checkSlugOp } from '#/modules/entities/operations/check-slug';
import { actorFrom } from '#/permissions/access';
import { defaultHook } from '#/utils/default-hook';
import { log } from '#/utils/logger';
import type { AppStreamSubscriber } from './helpers/dispatch-to-stream';
import { keepAlive, streamSubscriberManager, writeOffset } from './stream';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(entityRoutes.checkSlug, async (ctx) => {
  const { slug, entityType } = ctx.req.valid('json');
  const result = await checkSlugOp(ctx, slug, entityType);
  assertSuccess(result, 'user');
  return result.data.available ? ctx.body(null, 204) : ctx.body(null, 409);
});

// Subscriber caps: memory/dispatch-CPU backpressure for the single-process stream. The
// per-user cap leans on leader-tab election (one connection per browser profile); the global
// cap protects the VM. Both reject with 429 so clients ride their normal reconnect backoff.
const MAX_STREAMS_PER_USER = 10;
const MAX_STREAM_SUBSCRIBERS = 5000;

app.openapi(entityRoutes.appStream, async (ctx) => {
  const { user, memberships, isSystemAdmin } = ctx.var;

  if (
    streamSubscriberManager.size >= MAX_STREAM_SUBSCRIBERS ||
    streamSubscriberManager.getByChannel(`user:${user.id}`).length >= MAX_STREAMS_PER_USER
  ) {
    throw new AppError(429, 'too_many_requests', 'warn', { meta: { reason: 'stream_subscriber_cap' } });
  }

  const organizationIds = new Set(memberships.map((m) => m.organizationId));
  const cursor = await getLatestUserActivityId(organizationIds);

  return streamSSE(ctx, async (stream) => {
    ctx.header('Content-Encoding', '');
    await writeOffset(stream, cursor);

    const orgChannels = [...organizationIds].map((id) => `org:${id}`);
    const subscriber: AppStreamSubscriber = {
      id: crypto.randomUUID(),
      channel: orgChannels[0] ?? '',
      stream,
      userId: user.id,
      organizationIds,
      isSystemAdmin,
      memberships,
      cursor,
    };

    // The user channel carries self-membership events regardless of org registration: a
    // membership in a NEW org reaches the user here (org channels are registered at connect
    // time), and the frontend reconnects to re-register + catch up on that org's history.
    streamSubscriberManager.register(subscriber, [...orgChannels.slice(1), `user:${user.id}`]);
    log.debug('App stream subscriber registered', {
      subscriberId: subscriber.id,
      orgCount: organizationIds.size,
    });

    stream.onAbort(() => {
      streamSubscriberManager.unregister(subscriber.id);
      log.debug('App stream subscriber disconnected', { subscriberId: subscriber.id });
    });

    await keepAlive(stream);
    // biome-ignore lint/suspicious/noExplicitAny: streamSSE returns Response, not TypedResponse expected by OpenAPI handler
  }) as any;
});

app.openapi(entityRoutes.appCatchup, async (ctx) => {
  const { cursor, views } = ctx.req.valid('json');
  const actor = actorFrom(ctx as never);
  const result = await appCatchupOp(ctx.var.memberships, cursor, actor, views);
  assertSuccess(result, 'user');
  return ctx.json(result.data);
});

export const entityHandlers = app;
