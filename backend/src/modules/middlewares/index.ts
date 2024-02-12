import { config } from 'config';
import { compress } from 'hono/compress';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { customLogger } from '../../lib/custom-logger';
import { CustomHono } from '../../types/common';
import { rateLimiter } from './rate-limiter';

const app = new CustomHono();

// const tus = ImadoTus({
//   secret: env.TUS_UPLOAD_API_SECRET,
//   credentials: {
//     bucket: config.s3UploadBucket,
//     region: config.s3UploadRegion,
//     accessKeyId: env.AWS_S3_UPLOAD_ACCESS_KEY_ID,
//     secretAccessKey: env.AWS_S3_UPLOAD_SECRET_ACCESS_KEY,
//   },
// });

// app.all('/files', async (ctx) => {
//   // Hono does not provide raw request, but wrapped as Request (without Node's eventemitters)
//   tus.handle(ctx.req.raw, ctx.res);
// });

// app.all('/files/*', async (ctx) => {
//   // Hono does not provide raw request, but wrapped as Request (without Node's eventemitters)
//   tus.handle(ctx.req.raw, ctx.res);
// });

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
