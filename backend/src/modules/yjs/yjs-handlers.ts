import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import type { Env } from '#/core/context';
import '#/modules/yjs/yjs-module';
import { env } from '#/env';
import { getYjsTokenOp } from '#/modules/yjs/operations/get-yjs-token';
import { materializeDescriptionOp } from '#/modules/yjs/operations/materialize-description';
import { yjsRoutes } from '#/modules/yjs/yjs-routes';
import { defaultHook } from '#/utils/default-hook';
import { log } from '#/utils/logger';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(yjsRoutes.getYjsToken, async (ctx) => {
  const data = getYjsTokenOp(ctx.var.user.id, ctx.var.memberships, ctx.req.valid('query'));
  return ctx.json(data, 200);
});

const materializeBodySchema = z.object({
  entityType: z.string().max(50),
  entityId: z.uuid(),
  tenantId: z.string().max(50),
  organizationId: z.uuid().nullable(),
  description: z.string(),
  editedBy: z.uuid(),
});

/**
 * Internal relay → backend endpoint: persist a Yjs collab session's description.
 * Plain (non-OpenAPI) route, outside the public API contract. Secret-gated
 * with the same shared secret the relay uses for edit tokens (CDC-auth precedent).
 */
app.post('/materialize', async (ctx) => {
  const secret = ctx.req.header('x-yjs-secret');
  if (!secret || secret !== env.YJS_SECRET) {
    log.warn('Yjs materialize auth failed');
    return ctx.json({ error: 'unauthorized' }, 401);
  }

  const parsed = materializeBodySchema.safeParse(await ctx.req.json().catch(() => null));
  if (!parsed.success) return ctx.json({ error: 'invalid_body' }, 400);

  const { sanitized } = await materializeDescriptionOp(parsed.data);
  return ctx.json({ success: true, sanitized }, 200);
});

export const yjsHandlers = app;
