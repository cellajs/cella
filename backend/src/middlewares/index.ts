import { sentry } from '@hono/sentry';
import { config } from 'config';
import { compress } from 'hono/compress';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import { CustomHono } from '../types/common';
import { logEvent } from './logger/log-event';
import { logger } from './logger/logger';
import { rateLimiter } from './rate-limiter';

const app = new CustomHono();

// Secure headers
app.use('*', secureHeaders());

// Sentry
app.use(
  '*',
  sentry({
    dsn: config.sentryDsn,
  }),
);

// Health check for render.com
app.get('/ping', (c) => c.text('pong'));

// Logger
app.use('*', logger(logEvent as unknown as Parameters<typeof logger>[0]));

// CORS
app.use(
  '*',
  cors({
    origin: config.frontendUrl,
    credentials: true,
    allowMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
    allowHeaders: [],
  }),
);

// Compress response
app.use('*', compress());

// CSRF protection
app.use(
  '*',
  csrf({
    origin: config.frontendUrl,
  }),
);

// Rate limiter
app.use('*', rateLimiter({ points: 50, duration: 60 * 60, blockDuration: 60 * 30, keyPrefix: 'common_fail' }, 'fail'));

export default app;
