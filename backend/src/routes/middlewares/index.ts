import config from 'config';
import { compress } from 'hono/compress';
import { getCookie } from 'hono/cookie';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { getI18n } from 'i18n/index';
import { CustomHono } from '../../types/common';
import { customLogger } from './custom-logger';

const i18n = getI18n('backend');

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

// Logger
app.use('*', logger(customLogger as unknown as Parameters<typeof logger>[0]));

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

// Health check for render.com
app.get('/ping', (c) => c.text('pong'));

// Compress middleware
app.use('*', compress());

// CSRF middleware
app.use(
  '*',
  csrf({
    origin: config.frontendUrl,
  }),
);

// i18next middleware checks if the user has a language cookie and sets the language accordingly
app.use('*', async (ctx, next) => {
  const { i18next } = getCookie(ctx);

  i18n.changeLanguage(i18next || 'en');

  await next();
});

export default app;
