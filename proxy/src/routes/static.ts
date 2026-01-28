import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { env, isDevelopment } from '../env';
import { forwardRequest } from '../lib/proxy';
import { logEvent } from '../pino';

const app = new Hono();

if (isDevelopment) {
  /**
   * Development mode: Proxy all requests to Vite dev server.
   * This enables HMR, source maps, and all Vite dev features.
   */
  logEvent('info', 'Static routes configured for development (Vite proxy)');

  app.all('/*', async (c) => {
    return forwardRequest(c, {
      targetUrl: env.VITE_DEV_URL,
    });
  });
} else {
  /**
   * Production mode: Serve pre-built static files from frontend/dist.
   * Includes SPA fallback for client-side routing.
   */
  const staticDir = resolve(process.cwd(), env.STATIC_DIR);
  const indexPath = join(staticDir, 'index.html');

  // Verify static directory exists on startup
  if (!existsSync(staticDir)) {
    logEvent('warn', 'Static directory does not exist', { staticDir });
  } else if (!existsSync(indexPath)) {
    logEvent('warn', 'index.html not found in static directory', { indexPath });
  } else {
    logEvent('info', 'Static routes configured for production', { staticDir });
  }

  // Serve static files
  app.use(
    '/*',
    serveStatic({
      root: env.STATIC_DIR,
    }),
  );

  // SPA fallback - serve index.html for any unmatched routes
  // This enables client-side routing (TanStack Router)
  app.get('*', serveStatic({ root: env.STATIC_DIR, path: 'index.html' }));
}

export { app as staticRoutes };
