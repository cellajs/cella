import { Hono } from 'hono';
import { safeEqual } from 'shared/utils/safe-equal';
import { z } from 'zod';
import type { Env } from '#/core/context';
import { modeSecret } from '#/env';
import { materializeDescriptionOp } from '#/modules/yjs/operations/materialize-description';
import { productEntityTypeSchema } from '#/schemas';
import { log } from '#/utils/logger';

const materializeBodySchema = z.object({
  entityType: productEntityTypeSchema,
  entityId: z.uuid(),
  tenantId: z.string().max(50),
  organizationId: z.uuid().nullable(),
  description: z.string(),
  // The log's senders, newest first; the relay sends at most 20.
  editors: z.array(z.uuid()).min(1).max(50),
});

/**
 * The Yjs relay's routes, mounted on the internal listener only (lib/listeners.ts): the public API has no path to
 * them. Every call carries the relay's own secret, which authenticates the relay and signs nothing.
 */
const app = new Hono<Env>();

/** Persists a compacted collaborative document to its entity; 410 tells the relay the entity is gone, so its rows can go too. */
app.post('/materialize', async (ctx) => {
  const secret = ctx.req.header('x-yjs-relay-secret');
  if (!secret || !safeEqual(secret, modeSecret('YJS_RELAY_SECRET'))) {
    log.warn('Yjs materialize auth failed');
    return ctx.json({ error: 'unauthorized' }, 401);
  }

  const parsed = materializeBodySchema.safeParse(await ctx.req.json().catch(() => null));
  if (!parsed.success) return ctx.json({ error: 'invalid_body' }, 400);

  const result = await materializeDescriptionOp(parsed.data);
  if (result.outcome === 'gone') return ctx.json({ error: 'gone' }, 410);
  return ctx.json({ success: true, sanitized: result.sanitized, editedBy: result.editedBy }, 200);
});

export const yjsInternalHandlers = app;
