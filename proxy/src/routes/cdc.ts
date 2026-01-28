import { Hono } from 'hono';
import { env } from '../env';

const app = new Hono();

/**
 * Proxy CDC health endpoint.
 * Returns the CDC worker's health status or a 503 if unavailable.
 */
app.get('/health', async (c) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), env.HEALTH_CHECK_TIMEOUT);

    const response = await fetch(`${env.CDC_URL}/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();
    return c.json(data, response.status as 200);
  } catch (error) {
    return c.json(
      {
        status: 'unreachable',
        error: 'CDC service unavailable',
      },
      503,
    );
  }
});

/**
 * Proxy CDC metrics endpoint.
 * Returns CDC worker metrics or a 503 if unavailable.
 */
app.get('/metrics', async (c) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), env.HEALTH_CHECK_TIMEOUT);

    const response = await fetch(`${env.CDC_URL}/metrics`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();
    return c.json(data);
  } catch (error) {
    return c.json({ error: 'CDC metrics unavailable' }, 503);
  }
});

export { app as cdcProxy };
