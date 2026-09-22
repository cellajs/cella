import process from 'node:process';
import { startOauthServer } from '#/modules/oauth-server/worker/oauth-worker-entry';

startOauthServer().catch((e) => {
  process.stderr.write(`[oauth-server] Failed to start: ${e instanceof Error ? e.stack : e}\n`);
  setTimeout(() => process.exit(1), 500);
});
