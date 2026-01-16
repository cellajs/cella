import { appConfig } from 'config';
import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';
import type { Env } from '#/lib/context';
import { AppError } from '#/lib/error';

/**
 * Middleware to apply dynamic body size limits based on Content-Type.
 * - application/json → `appConfig.jsonBodyLimit`
 * - multipart/form-data → `appConfig.fileUploadLimit`
 * - everything else → `appConfig.defaultBodyLimit`
 */
export const dynamicBodyLimit: MiddlewareHandler<Env> = createMiddleware<Env>(async (ctx, next) => {
  const contentType = ctx.req.header('content-type') ?? '';

  const isJson = contentType.includes('application/json');
  const isMultipart = contentType.includes('multipart/form-data');

  const maxSize = isJson
    ? appConfig.jsonBodyLimit
    : isMultipart
      ? appConfig.fileUploadLimit
      : appConfig.defaultBodyLimit;

  const limit = bodyLimit({
    maxSize,
    onError: () => {
      throw new AppError(413, 'body_too_large', 'warn');
    },
  });

  return limit(ctx, next);
});
