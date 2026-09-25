import { Hono } from 'hono';
import type { Env } from '#/core/context';
import { log } from '#/utils/logger';

/**
 * Rollout bridge for one release. A Yjs relay from before the internal listener posts to the public
 * `/yjs/materialize` and counts any 4xx as permanent, compacting its log without a write, so a split-VM rollout
 * that updates the backend first would lose the edits of every session that relay compacts meanwhile. A 503 is
 * retryable to that relay: it keeps the log until its own VM runs a relay that posts to the internal listener.
 */
// TODO(rollout): delete this file and its mount in yjs-module.ts in the release after the one that ships it.
const app = new Hono<Env>();

app.post('/materialize', (ctx) => {
  log.warn('Materialize call on the public path: a relay from before the internal listener is still running');
  ctx.header('Retry-After', '300');
  return ctx.json({ error: 'materialize_moved' }, 503);
});

export const yjsLegacyHandlers = app;
