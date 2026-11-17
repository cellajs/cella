import { gunzipSync, zstdDecompressSync } from 'node:zlib';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { compressResponse } from './compress';

// Preconditions answer an entity with `no-transform` to keep its tag strong, and the change stream is `text/event-stream`.
const small = { id: 1 };
const large = { items: Array.from({ length: 200 }, (_, index) => ({ id: index, name: `row ${index}` })) };
const decoders = { zstd: zstdDecompressSync, gzip: gunzipSync };

const app = new Hono();
app.use('*', compressResponse);
app.get('/small', (ctx) => ctx.json(small));
app.get('/large', (ctx) => ctx.json(large, 200, { ETag: '"tag"' }));
app.get('/no-transform', (ctx) => ctx.json(large, 200, { ETag: '"tag"', 'Cache-Control': 'no-store, no-transform' }));
// Never closes: a middleware that buffers it holds the request until the test times out.
app.get('/stream', () => {
  const body = new ReadableStream({ start: (controller) => controller.enqueue(new TextEncoder().encode(JSON.stringify(large))) });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
});

const cases: { path: string; accept: string; encoding?: keyof typeof decoders }[] = [
  { path: '/small', accept: 'zstd, gzip' },
  { path: '/large', accept: 'zstd, gzip', encoding: 'zstd' },
  { path: '/large', accept: 'gzip', encoding: 'gzip' },
  { path: '/large', accept: 'zstd;q=0, gzip', encoding: 'gzip' },
  { path: '/large', accept: '*', encoding: 'zstd' },
  { path: '/large', accept: 'identity' },
  { path: '/no-transform', accept: 'zstd, gzip' },
  { path: '/stream', accept: 'zstd, gzip' },
];

describe('compressResponse', () => {
  it.each(cases)('GET $path with Accept-Encoding "$accept" answers $encoding', async ({ path, accept, encoding }) => {
    const res = await app.request(path, { headers: { 'Accept-Encoding': accept } });
    expect(res.headers.get('Content-Encoding') ?? undefined).toBe(encoding);
    if (path === '/stream') return res.body?.cancel();

    const body = Buffer.from(await res.arrayBuffer());
    expect((encoding ? decoders[encoding](body) : body).toString()).toBe(JSON.stringify(path === '/small' ? small : large));
    if (path !== '/small') expect(res.headers.get('ETag')).toBe(encoding ? 'W/"tag"' : '"tag"');
  });
});
