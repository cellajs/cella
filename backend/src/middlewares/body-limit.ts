import { bodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';
import { errorResponse } from '#/lib/errors';

import { config } from 'config';
import type { Env } from '#/lib/context';

/**
 * Middleware to apply dynamic body size limits based on Content-Type.
 * - application/json → `config.jsonBodyLimit`
 * - multipart/form-data → `config.fileUploadLimit`
 * - everything else → `config.defaultBodyLimit`
 */
export const dynamicBodyLimit = createMiddleware<Env>(async (ctx, next) => {
  const contentType = ctx.req.header('content-type') ?? '';

  const isJson = contentType.includes('application/json');
  const isMultipart = contentType.includes('multipart/form-data');

  const maxSize = isJson ? config.jsonBodyLimit : isMultipart ? config.fileUploadLimit : config.defaultBodyLimit;

  const limit = bodyLimit({
    maxSize,
    onError: (ctx) => {
      return errorResponse(ctx, 413, 'body_too_large', 'warn', undefined, {
        path: ctx.req.path,
      });
    },
  });

  return limit(ctx, next);
});
