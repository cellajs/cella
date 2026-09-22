import type { IncomingMessage, ServerResponse } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { eq, sql } from 'drizzle-orm';
import type Provider from 'oidc-provider';
import { createHealthApp } from 'shared/health-app';
import { baseDb } from '#/db/db';
import { env } from '#/env';
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

/**
 * One Node request listener for the authorization server process: the provider (a plain Node handler, mounted with
 * the prefix stripped), the interaction routes the app renders itself, and the health endpoint. Shared by the process
 * entry and the integration tests.
 */
export function createOauthListener(provider: Provider): Listener {
  const oidc = provider.callback();
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
