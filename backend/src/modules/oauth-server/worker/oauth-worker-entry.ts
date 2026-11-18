import { createServer, type Server } from 'node:http';
import { appConfig } from 'shared';
import { listenHost } from 'shared/utils/listen-host';
import { waitForBackend } from 'shared/utils/wait-for-backend';
import { setupGracefulShutdown } from 'shared/utils/worker-lifecycle';
import { env } from '#/env';
import { baseLog } from '#/lib/pino';
import { otel } from '#/lib/tracing';

let server: Server | undefined;
let keyCheckTimer: NodeJS.Timeout | undefined;

/** How often the worker rotates a due keystore and rebuilds its provider when the signing key changed. */
const keyCheckMs = 60 * 60 * 1000;

/**
 * The authorization server as its own process on the same public origin: the reverse proxy routes
 * `/oauth/*` here. Under singleVM the API process calls this with the oauth port and `inProcess`, and stops it with
 * `shutdownOauthWorker` from its own shutdown handler.
 */
export async function startOauthWorker(options: { port?: number; inProcess?: boolean } = {}): Promise<void> {
  if (appConfig.services.oauth.enabled === false) {
    baseLog.info('OAuth server disabled by appConfig');
    return;
  }
  const port = options.port ?? appConfig.services.oauth.port;

  if (!options.inProcess) {
    otel.start();
    otel.verifyConnection();
    if (env.NODE_ENV === 'development') await waitForBackend();
  }

  // Loaded here so an app with the server off never loads oidc-provider, which warns about the Node version on import.
  const [{ currentSigningKeyId, ensureSigningKeys, rotateSigningKeys }, { createProvider }, { createOauthListener }] = await Promise.all([
    import('#/modules/oauth-server/keystore'),
    import('#/modules/oauth-server/provider'),
    import('#/modules/oauth-server/server'),
  ]);
  await ensureSigningKeys();
  await rotateSigningKeys();
  // Read before the provider loads its keys: a rotation in between costs one extra rebuild, never a missed one.
  let signerKid = await currentSigningKeyId();
  let listener = createOauthListener(await createProvider());
  // Each request runs on the listener of its arrival: a swap leaves requests in flight on the old provider.
  server = createServer((req, res) => listener(req, res));

  keyCheckTimer = setInterval(async () => {
    try {
      // Replaces a signing key whose row was deleted after a leak.
      await ensureSigningKeys();
      await rotateSigningKeys();
      const kid = await currentSigningKeyId();
      if (kid === signerKid) return;
      listener = createOauthListener(await createProvider());
      signerKid = kid;
      baseLog.info('OAuth provider rebuilt on a new signing key', { kid });
    } catch (err) {
      baseLog.error('OAuth signing key check failed', { err });
    }
  }, keyCheckMs);
  keyCheckTimer.unref();

  server.listen(port, listenHost(), () => baseLog.info(`OAuth server listening on port ${port} for ${appConfig.oauthUrl}`));

  if (!options.inProcess) {
    setupGracefulShutdown({
      name: 'oauth-worker',
      cleanup: async () => {
        shutdownOauthWorker();
        await otel.shutdown();
      },
      log: (msg) => baseLog.info(msg),
    });
  }
}

/** Closes the authorization server's listener: its own process's shutdown, and the API's cleanup under `singleVM`. */
export function shutdownOauthWorker(): void {
  clearInterval(keyCheckTimer);
  server?.close();
}
