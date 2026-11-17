import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';

const tooLarge = () => {
  throw new AppError(413, 'body_too_large', 'warn');
};

const streamedBodyLimit = bodyLimit({ maxSize: appConfig.maxBodySize, onError: tooLarge });

/**
 * Refuses (413) a body past `maxBodySize`, declared or streamed, whatever its Content-Type. A cap chosen by type would
 * hand a JSON route the larger one: the JSON validator parses any `+json` type. The method and a declared length answer
 * first: Hono's `bodyLimit` reads the request's `body`, which on the node server builds a native request.
 */
export const dynamicBodyLimit: MiddlewareHandler<Env> = (ctx, next) => {
  const { method, headers } = ctx.req.raw;
  if (method === 'GET' || method === 'HEAD') return next();
  const length = headers.get('content-length');
  if (length === null || headers.has('transfer-encoding')) return streamedBodyLimit(ctx, next);
  return Number.parseInt(length, 10) > appConfig.maxBodySize ? tooLarge() : next();
};
