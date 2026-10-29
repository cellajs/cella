import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';

/**
 * Refuses (413) a body past `jsonBodyLimit`, declared or streamed, whatever its Content-Type: the JSON validator parses
 * any `+json` type, so a cap chosen by type would hand a JSON route the larger one.
 */
export const dynamicBodyLimit: MiddlewareHandler<Env> = bodyLimit({
  maxSize: appConfig.jsonBodyLimit,
  onError: () => {
    throw new AppError(413, 'body_too_large', 'warn');
  },
});
