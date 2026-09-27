import type { IncomingMessage, ServerResponse } from 'node:http';
import process from 'node:process';
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
import { type HealthComponent, mapDatabaseComponent, rollupStatus } from '#/lib/health-helpers';
import { authInvalidationHealth } from '#/middlewares/guard/invalidation-listener';
import { limiterScope } from '#/middlewares/rate-limiter/helpers';
import { createInteractionsApp } from '#/modules/oauth-server/interactions';
import { signingKeysTable } from '#/modules/oauth-server/signing-keys-db';

export const OAUTH_MOUNT = '/oauth';

/**
 * The `?depth=full` diagnostics, in the API's component shape: the store answers, a signing key exists and this
 * process hears auth invalidations; any of them missing is a 503.
 */
async function probeHealth(): Promise<{ httpStatus: number; body: unknown }> {
  const components: Record<string, HealthComponent> = {};
  const startedAt = Date.now();
  let signingKey = false;
  try {
    await baseDb.execute(sql`select 1`);
    components.database = mapDatabaseComponent(true, Date.now() - startedAt);
    const [key] = await baseDb
      .select({ id: signingKeysTable.id })
      .from(signingKeysTable)
      .where(eq(signingKeysTable.status, 'current'))
      .limit(1);
    signingKey = key !== undefined;
  } catch {
    // The store did not answer, or the key query it reached first did not: reported below.
    components.database ??= mapDatabaseComponent(false, null);
  }
  components.signingKey = signingKey
    ? { status: 'healthy', checkedVia: 'local' }
    : { status: 'unhealthy', checkedVia: 'local', reason: 'signing_key_missing' };
  components.authInvalidation = authInvalidationHealth();
  const status = rollupStatus(components, new Set(Object.keys(components)));
  return {
    httpStatus: status === 'unhealthy' ? 503 : 200,
    body: { status, uptime: Math.floor(process.uptime()), components },
  };
}

type Listener = (req: IncomingMessage, res: ServerResponse) => void;

/**
 * The provider with each request bound for its client metadata fetch hook (`limiterScope`), as the interaction routes
 * are: the hook charges the per-IP fetch budget only when a client id is about to be fetched, so a request that fetches
 * nothing, a known client's refresh among them, never counts. The provider answers on the raw response and reads the
 * request body itself.
 */
function withLimiterScope(handle: (req: IncomingMessage, res: ServerResponse) => unknown): Listener {
  const app = new Hono<Env>();
  app.onError(appErrorHandler);
  app.use(limiterScope);
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
  const oidc = withLimiterScope(provider.callback());
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
      oidc(req, res);
      return;
    }
    res.statusCode = 404;
    res.end();
  };
}
