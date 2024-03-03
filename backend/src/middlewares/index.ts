import { config } from 'config';
import { compress } from 'hono/compress';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import { customLogger } from '../lib/custom-logger';
import { CustomHono } from '../types/common';
import { logger } from './logger';
import { rateLimiter } from './rate-limiter';

const app = new CustomHono();

// Secure headers
app.use('*', secureHeaders());

// Health check for render.com
app.get('/ping', (c) => c.text('pong'));

// Logger
app.use('*', logger(customLogger as unknown as Parameters<typeof logger>[0]));

// Rate limiter
app.use('*', rateLimiter({ points: 50, duration: 60 * 60, blockDuration: 60 * 30 }, 'fail'));

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

// Compress middleware
app.use('*', compress());

// CSRF middleware
app.use(
  '*',
  csrf({
    origin: config.frontendUrl,
  }),
);

export default app;
