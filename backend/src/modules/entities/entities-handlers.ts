import { OpenAPIHono } from '@hono/zod-openapi';
import { streamSSE } from 'hono/streaming';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import '#/modules/entities/entities-listeners';
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
  return result.available ? ctx.body(null, 204) : ctx.body(null, 409);
});

// Caps bound memory and dispatch CPU for the single-process stream; both reject with 429 so
// clients use their normal reconnect backoff.
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

    // The user channel carries self-membership events regardless of org registration, so a
    // membership in a new org reaches the user here and the frontend reconnects to re-register.
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
  const actor = actorFrom(ctx);
  const result = await appCatchupOp(ctx.var.memberships, cursor, actor, views);
  return ctx.json(result);
});

export const entityHandlers = app;
