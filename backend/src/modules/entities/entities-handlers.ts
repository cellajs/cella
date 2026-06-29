import { OpenAPIHono } from '@hono/zod-openapi';
import { streamSSE } from 'hono/streaming';
import { hierarchy } from 'shared';
import type { Env } from '#/core/context';
import { assertSuccess } from '#/core/operation-result';
import '#/modules/entities/entities-listeners';
import '#/modules/entities/entities-module';
import entityRoutes from '#/modules/entities/entities-routes';
import { appCatchupOp, getLatestUserActivityId } from '#/modules/entities/operations/app-catchup';
import { checkSlugOp } from '#/modules/entities/operations/check-slug';
import { getLatestPublicActivityId, publicCatchupOp } from '#/modules/entities/operations/public-catchup';
import { defaultHook } from '#/utils/default-hook';
import { logEvent } from '#/utils/logger';
import type { AppStreamSubscriber } from './helpers/dispatch-to-stream';
import { keepAlive, streamSubscriberManager, writeOffset } from './stream';

const app = new OpenAPIHono<Env>({ defaultHook });

// ============================================
// Route handlers
// ============================================

app.openapi(entityRoutes.checkSlug, async (ctx) => {
  const { slug, entityType } = ctx.req.valid('json');
  const result = await checkSlugOp(ctx, slug, entityType);
  assertSuccess(result, 'user');
  return result.data.available ? ctx.body(null, 204) : ctx.body(null, 409);
});

app.openapi(entityRoutes.publicStream, async (ctx) => {
  const cursor = await getLatestPublicActivityId();

  return streamSSE(ctx, async (stream) => {
    ctx.header('Content-Encoding', '');
    await writeOffset(stream, cursor);

    const channels = hierarchy.publicStreamTypes.map((t) => `public:${t}`);
    const subscriber = { id: crypto.randomUUID(), channel: channels[0] ?? 'public:default', stream, cursor };
    streamSubscriberManager.register(subscriber, channels.slice(1));
    logEvent(ctx, 'debug', 'Public stream subscriber registered', { subscriberId: subscriber.id });

    stream.onAbort(() => {
      streamSubscriberManager.unregister(subscriber.id);
      logEvent(ctx, 'debug', 'Public stream subscriber disconnected', { subscriberId: subscriber.id });
    });

    await keepAlive(stream);
    // biome-ignore lint/suspicious/noExplicitAny: streamSSE returns Response, not TypedResponse expected by OpenAPI handler
  }) as any;
});

app.openapi(entityRoutes.publicCatchup, async (ctx) => {
  const { cursor, seqs } = ctx.req.valid('json');
  const result = await publicCatchupOp(cursor, seqs);
  assertSuccess(result, 'user');
  return ctx.json(result.data);
});

app.openapi(entityRoutes.appStream, async (ctx) => {
  const { user, memberships, isSystemAdmin, sessionToken } = ctx.var;
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
      sessionToken,
      organizationIds,
      isSystemAdmin,
      memberships,
      cursor,
    };

    // NOTE: If user is added to new org while connected, they won't receive events for that
    // org until reconnect. Frontend should reconnect stream when membership.created is received.
    streamSubscriberManager.register(subscriber, orgChannels.slice(1));
    logEvent(ctx, 'debug', 'App stream subscriber registered', {
      subscriberId: subscriber.id,
      orgCount: organizationIds.size,
    });

    stream.onAbort(() => {
      streamSubscriberManager.unregister(subscriber.id);
      logEvent(ctx, 'debug', 'App stream subscriber disconnected', { subscriberId: subscriber.id });
    });

    await keepAlive(stream);
    // biome-ignore lint/suspicious/noExplicitAny: streamSSE returns Response, not TypedResponse expected by OpenAPI handler
  }) as any;
});

app.openapi(entityRoutes.appCatchup, async (ctx) => {
  const { cursor, seqs } = ctx.req.valid('json');
  const result = await appCatchupOp(ctx.var.memberships, cursor, seqs);
  assertSuccess(result, 'user');
  return ctx.json(result.data);
});

export const entityHandlers = app;
