import process from 'node:process';
import { type ServerType, serve } from '@hono/node-server';
import { waitForBackend } from 'shared/wait-for-backend';
import { setupGracefulShutdown } from 'shared/worker-lifecycle';
import { env } from '#/env';
import { getPgBoss, stopPgBoss } from '#/lib/pg-boss';
import { otel } from '#/lib/tracing';
import { aiHandlers } from '#/modules/ai/ai-handlers';
import baseApp from '#/server';

const port = Number(env.PORT ?? '4003');

export async function startAiWorker(): Promise<void> {
  const hasApiKey = !!env.SCW_AI_API_KEY;

  if (!hasApiKey) {
    console.info('[ai-worker] SCW_AI_API_KEY not set, running as no-op (health-only)');
  }

  if (hasApiKey) {
    otel.start();
    otel.verifyConnection();

    // Wait for the API to be ready (it owns migrations)
    if (env.NODE_ENV === 'development') {
      await waitForBackend(2000, 60_000);
    }

    // Mount AI routes on the shared base app (middleware, health, error handling)
    baseApp.route('/:tenantId/:organizationId/chats', aiHandlers);

    // Start pg-boss (creates queues)
    await getPgBoss();
    console.info('[ai-worker] pg-boss started, queues ready');

    // Phase 5: active job handlers will be registered here
    // boss.work('ai-yjs', { teamSize: 3, teamConcurrency: 3 }, yjsJobHandler);
    // boss.work('chat-retry', { teamSize: 2 }, chatRetryHandler);
  }

  let server: ServerType | undefined;

  server = serve(
    {
      fetch: baseApp.fetch,
      hostname: '0.0.0.0',
      port,
    },
    () => {
      console.info(`[ai-worker] AI service listening on port ${port}${hasApiKey ? '' : ' (no-op)'}`);
    },
  );

  setupGracefulShutdown({
    name: 'ai-worker',
    cleanup: async () => {
      if (server) server.close();
      if (hasApiKey) await stopPgBoss();
      if (hasApiKey) await otel.shutdown();
    },
    log: (msg) => process.stderr.write(`[ai-worker] ${msg}\n`),
  });
}
