import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { secureHeaders } from 'hono/secure-headers';
import { logEvent } from './pino';
import { apiProxy } from './routes/api';
import { cdcProxy } from './routes/cdc';
import { healthRoutes } from './routes/health';
import { staticRoutes } from './routes/static';

/**
 * Create and configure the Hono proxy application.
 * Routes requests to backend API, CDC worker, or serves static frontend.
 */
const app = new Hono();

// Global middleware
app.use('*', secureHeaders());
app.use('*', compress());

// Request logging middleware
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;

  // Only log non-static requests or errors
  const path = c.req.path;
  const status = c.res.status;
  const isStatic = !path.startsWith('/api') && !path.startsWith('/cdc') && !path.startsWith('/health');

  if (!isStatic || status >= 400) {
    logEvent('debug', 'Request', {
      method: c.req.method,
      path,
      status,
      duration: `${duration}ms`,
    });
  }
});

// Mount route handlers in order of specificity
// More specific routes first, catch-all static routes last
app.route('/api', apiProxy);
app.route('/cdc', cdcProxy);
app.route('/health', healthRoutes);
app.route('/', staticRoutes);

// Not found handler (should rarely trigger due to static fallback)
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Global error handler
app.onError((err, c) => {
  logEvent('error', 'Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: c.req.path,
  });

  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
