import { promisify } from 'node:util';
import { gzip, zstdCompress } from 'node:zlib';
import type { MiddlewareHandler } from 'hono';
import { COMPRESSIBLE_CONTENT_TYPE_REGEX } from 'hono/compress';
import { parseAccept } from 'hono/utils/accept';

const encoders = { zstd: promisify(zstdCompress), gzip: promisify(gzip) };
const untouchedStatuses = new Set([204, 205, 206, 304]);
const noTransform = /(?:^|,)\s*no-transform\s*(?:,|$)/i;

/** The first of zstd and gzip that `Accept-Encoding` gives a q above 0, by name or through `*`. */
const acceptedEncoding = (header = '') => {
  const q = Object.fromEntries(parseAccept(header).map((accept) => [accept.type.toLowerCase(), accept.q]));
  return (['zstd', 'gzip'] as const).find((encoding) => (q[encoding] ?? q['*'] ?? 0) > 0);
};

/**
 * Compresses a GET response body of 1024 bytes or more, measured on the body itself, with zstd or else gzip, as
 * `Accept-Encoding` allows (`q=0` refuses one, `*` accepts both). A response passes as it is when its status is 204,
 * 205, 206 or 304, it has a `Content-Encoding` or `Transfer-Encoding`, its `Cache-Control` holds `no-transform`, or its
 * Content-Type is off Hono's compressible list, which leaves out `text/event-stream`. A compressed response adds
 * `Vary: Accept-Encoding` and weakens a strong `ETag` to `W/`.
 */
export const compressResponse: MiddlewareHandler = async (ctx, next) => {
  if (ctx.req.method !== 'GET') return next();
  await next();

  const { status, headers } = ctx.res;
  if (untouchedStatuses.has(status) || headers.has('Content-Encoding') || headers.has('Transfer-Encoding')) return;
  if (!COMPRESSIBLE_CONTENT_TYPE_REGEX.test(headers.get('Content-Type') ?? '') || noTransform.test(headers.get('Cache-Control') ?? '')) return;
  const encoding = acceptedEncoding(ctx.req.header('Accept-Encoding'));
  if (!encoding) return;

  const body = new Uint8Array(await ctx.res.arrayBuffer());
  const compressed = body.byteLength < 1024 ? undefined : await encoders[encoding](body);
  if (compressed) {
    headers.set('Content-Encoding', encoding);
    headers.delete('Content-Length');
    headers.append('Vary', 'Accept-Encoding');
    const etag = headers.get('ETag');
    if (etag?.startsWith('"')) headers.set('ETag', `W/${etag}`);
  }
  // Cleared first: Hono's setter rebuilds a replacement from its body stream, which node-server cannot write as one buffer.
  ctx.res = undefined;
  ctx.res = new Response(compressed ?? body, { status, headers });
};
