import { Hono } from 'hono';
import { env } from '../env';
import { forwardRequest } from '../lib/proxy';

const app = new Hono();

/**
 * Proxy all /api/* requests to the backend API server.
 * The /api prefix is stripped before forwarding, so /api/users -> /users.
 */
app.all('/*', async (c) => {
  return forwardRequest(c, {
    targetUrl: env.API_URL,
    stripPrefix: '/api',
  });
});

export { app as apiProxy };
