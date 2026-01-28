import { serve, type ServerType } from '@hono/node-server';
import { env } from './env';
import { logEvent } from './pino';
import app from './server';

/**
 * Hono Proxy Server Entry Point
 *
 * This server acts as a unified entry point that routes requests to:
 * - /api/* -> Backend API (localhost:4000)
 * - /cdc/* -> CDC Worker health/metrics (localhost:4001)
 * - /health -> Aggregated health check
 * - /* -> Static frontend (Vite dev or built files)
 *
 * Benefits:
 * - No CORS configuration needed (same-origin)
 * - Single domain for all services
 * - Simplified cookie handling
 * - Unified health monitoring
 */

// Server instance for graceful shutdown
let server: ServerType | null = null;

/**
 * Graceful shutdown handler.
 */
async function shutdown(signal: string): Promise<void> {
  logEvent('info', `Received ${signal}, shutting down proxy...`);

  if (server) {
    server.close(() => {
      logEvent('info', 'Proxy server closed');
      process.exit(0);
    });

    // Force exit after timeout
    setTimeout(() => {
      logEvent('warn', 'Forcing shutdown after timeout');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

// Handle shutdown signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logEvent('error', 'Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logEvent('error', 'Unhandled rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});

// Start the server
server = serve({
  fetch: app.fetch,
  port: env.PROXY_PORT,
});

logEvent('info', 'Hono proxy started', {
  port: env.PROXY_PORT,
  mode: env.NODE_ENV,
  apiUrl: env.API_URL,
  cdcUrl: env.CDC_URL,
  viteDevUrl: env.NODE_ENV === 'development' ? env.VITE_DEV_URL : undefined,
  staticDir: env.NODE_ENV !== 'development' ? env.STATIC_DIR : undefined,
});
