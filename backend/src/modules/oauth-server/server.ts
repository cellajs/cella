import type { IncomingMessage, ServerResponse } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import type Provider from 'oidc-provider';
import { createHealthApp } from 'shared/health-app';
import { env } from '#/env';
import { createInteractionsApp } from '#/modules/oauth-server/interactions';

export const OAUTH_MOUNT = '/oauth';

type Listener = (req: IncomingMessage, res: ServerResponse) => void;

/**
 * One Node request listener for the authorization server process: the provider (a plain Node handler, mounted with
 * the prefix stripped), the interaction routes cella renders itself, and the health endpoint. Shared by the process
 * entry and the integration tests.
 */
export function createOauthListener(provider: Provider): Listener {
  const oidc = provider.callback();
  const interactions = getRequestListener(createInteractionsApp(provider).fetch);
  const health = getRequestListener(
    createHealthApp({ version: env.RELEASE_SHA, full: () => ({ httpStatus: 200, body: { status: 'ok' } }) }).fetch,
  );

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
      // The provider knows its issuer path; it expects request paths relative to the mount.
      req.url = url.slice(OAUTH_MOUNT.length) || '/';
      oidc(req, res);
      return;
    }
    res.statusCode = 404;
    res.end();
  };
}
