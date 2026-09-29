import { Hono } from 'hono';
import { safeEqual } from 'shared/utils/safe-equal';
import { z } from 'zod';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { modeSecret } from '#/env';
import { materializeDescriptionOp } from '#/modules/yjs/operations/materialize-description';
import { productEntityTypeSchema } from '#/schemas';

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

/** Persists a compacted collaborative document to its entity. Refusals are `AppError`s as on every route; the relay reads the status alone, 410 meaning the entity is gone, so its rows can go too. */
app.post('/materialize', async (ctx) => {
  const secret = ctx.req.header('x-yjs-relay-secret');
  if (!secret || !safeEqual(secret, modeSecret('YJS_RELAY_SECRET'))) {
    throw new AppError(401, 'unauthorized', 'warn', { meta: { reason: 'Relay secret missing or wrong' } });
  }

  const parsed = materializeBodySchema.safeParse(await ctx.req.json().catch(() => null));
  if (!parsed.success) throw new AppError(400, 'invalid_request', 'warn', { meta: { reason: 'Invalid body' } });

  const { sanitized } = await materializeDescriptionOp(parsed.data);
  return ctx.json({ success: true, sanitized }, 200);
});

export const yjsInternalHandlers = app;
