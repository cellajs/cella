import type { IncomingMessage, ServerResponse } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type Provider from 'oidc-provider';
import { createHealthApp } from 'shared/health-app';
import type { Env } from '#/core/context';
import { baseDb } from '#/db/db';
import { env } from '#/env';
import { appErrorHandler } from '#/lib/error';
import { oauthRequestLimiter } from '#/middlewares/rate-limiter/limiters';
import { createInteractionsApp } from '#/modules/oauth-server/interactions';
import { signingKeysTable } from '#/modules/oauth-server/signing-keys-db';

export const OAUTH_MOUNT = '/oauth';

/** What the deploy smoke reads: the store answers and a signing key exists; either missing is a 503. */
async function probeHealth(): Promise<{ httpStatus: number; body: unknown }> {
  const components: Record<string, 'ok' | 'fail'> = { db: 'fail', signingKey: 'fail' };
  try {
    await baseDb.execute(sql`select 1`);
    components.db = 'ok';
    const [key] = await baseDb
      .select({ id: signingKeysTable.id })
      .from(signingKeysTable)
      .where(eq(signingKeysTable.status, 'current'))
      .limit(1);
    if (key) components.signingKey = 'ok';
  } catch {
    // Reported below as the failing component.
  }
  const ok = Object.values(components).every((status) => status === 'ok');
  return { httpStatus: ok ? 200 : 503, body: { status: ok ? 'ok' : 'fail', components } };
}

type Listener = (req: IncomingMessage, res: ServerResponse) => void;

/** What any client may read without a budget: the discovery documents and the public keys. */
const isPublicMetadata = (path: string) => path.startsWith('/.well-known/') || path === '/jwks';

/**
 * The provider behind the per-IP request budget (`oauthRequestLimiter`), which the interaction routes share: a spent
 * budget answers 429 before anything resolves a client id, so it never reaches a metadata document fetch. Past the
 * budget the provider answers on the raw response and reads the request body itself.
 */
function withRequestBudget(handle: (req: IncomingMessage, res: ServerResponse) => unknown): Listener {
  const app = new Hono<Env>();
  app.onError(appErrorHandler);
  app.use(oauthRequestLimiter);
  app.all('*', async (c) => {
    await handle(c.env.incoming, c.env.outgoing);
    return RESPONSE_ALREADY_SENT;
  });
  const listener = getRequestListener(app.fetch, { autoCleanupIncoming: false });
  return (req, res) => void listener(req, res);
}

/**
 * One Node request listener for the authorization server process: the provider (a plain Node handler, mounted with
 * the prefix stripped), the interaction routes the app renders itself, and the health endpoint. Shared by the process
 * entry and the integration tests.
 */
export function createOauthListener(provider: Provider): Listener {
  const oidc = provider.callback();
  const limitedOidc = withRequestBudget(oidc);
  const interactions = getRequestListener(createInteractionsApp(provider).fetch);
  const health = getRequestListener(createHealthApp({ version: env.RELEASE_SHA, full: probeHealth }).fetch);

  return (req, res) => {
    const url = req.url ?? '/';
    if (
      url === '/health' ||
      url.startsWith('/health?') ||
      url === `${OAUTH_MOUNT}/health` ||
      url.startsWith(`${OAUTH_MOUNT}/health?`)
    ) {
      req.url = url.replace(OAUTH_MOUNT, '');
      health(req, res);
      return;
    }
    if (url.startsWith(`${OAUTH_MOUNT}/interaction/`)) {
      interactions(req, res);
      return;
    }
    if (url === OAUTH_MOUNT || url.startsWith(`${OAUTH_MOUNT}/`) || url.startsWith(`${OAUTH_MOUNT}?`)) {
      // The provider expects paths relative to the mount and rebuilds absolute URLs (resume, redirects) from
      // `originalUrl`, the Express convention it reads for the mount path.
      (req as IncomingMessage & { originalUrl?: string }).originalUrl = url;
      req.url = url.slice(OAUTH_MOUNT.length) || '/';
      if (isPublicMetadata(req.url)) oidc(req, res);
      else limitedOidc(req, res);
      return;
    }
    res.statusCode = 404;
    res.end();
  };
}
