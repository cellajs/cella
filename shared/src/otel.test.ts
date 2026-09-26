import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { context, propagation, SpanStatusCode, trace } from '@opentelemetry/api';
import type { ReadableSpan, SpanExporter, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOtelSDK } from './otel.ts';

/** An exporter that keeps every span it receives; unlike InMemorySpanExporter, shutdown keeps them. */
const collectingExporter = (spans: ReadableSpan[]): SpanExporter => ({
  export: (batch, done) => {
    spans.push(...batch);
    done({ code: 0 });
  },
  shutdown: async () => {},
  forceFlush: async () => {},
});

/** Everything a span carries to the backend that could hold a string. */
const exportedText = (spans: ReadableSpan[]) =>
  JSON.stringify(
    spans.map((span) => ({ name: span.name, attributes: span.attributes, events: span.events, status: span.status })),
  );

describe('createOtelSDK', () => {
  afterEach(() => {
    // Each SDK registers the global providers; clear them so the next test's SDK can register its own.
    trace.disable();
    context.disable();
    propagation.disable();
  });

  it('creates meterProvider without Maple key', () => {
    const otel = createOtelSDK({ serviceName: 'test-service' });

    expect(otel.meterProvider).toBeDefined();
    expect(otel.sdk).toBeUndefined();
  });

  it('creates sdk when spanProcessors are provided (no Maple key)', () => {
    const mockProcessor = {
      onStart: vi.fn(),
      onEnd: vi.fn(),
      forceFlush: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };

    const otel = createOtelSDK({
      serviceName: 'test-service',
      spanProcessors: [mockProcessor],
      autoInstrumentations: false,
    });

    expect(otel.sdk).toBeDefined();
  });

  it('normalizes metric interval below exporter timeout', () => {
    expect(() =>
      createOtelSDK({
        serviceName: 'test-service',
        mapleSecretIngestKey: 'test-key',
        metricIntervalMs: 1,
        autoInstrumentations: false,
      }),
    ).not.toThrow();
  });

  it('does not create sdk without Maple key or spanProcessors', () => {
    const otel = createOtelSDK({ serviceName: 'test-service' });
    expect(otel.sdk).toBeUndefined();
  });

  it('start does not throw when sdk is undefined', () => {
    const otel = createOtelSDK({ serviceName: 'test-service' });
    expect(() => otel.start()).not.toThrow();
  });

  it('shutdown does not throw when sdk is undefined', async () => {
    const otel = createOtelSDK({ serviceName: 'test-service' });
    await expect(otel.shutdown()).resolves.toBeUndefined();
  });

  it('verifyConnection logs skip message when no Maple key', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const otel = createOtelSDK({ serviceName: 'test-svc' });

    await otel.verifyConnection();

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('MAPLE_SECRET_INGEST_KEY not set'));
    spy.mockRestore();
  });

  it('exports ended spans through the trace exporter', async () => {
    const exported: ReadableSpan[] = [];
    const otel = createOtelSDK({
      serviceName: 'test-service',
      traceExporter: collectingExporter(exported),
      autoInstrumentations: false,
      flushOnShutdown: true,
    });
    otel.start();

    trace.getTracer('test').startSpan('work').end();
    await otel.shutdown();

    expect(exported.map((span) => span.name)).toEqual(['work']);
  });

  it('must not export a token via a span name, attribute, event or status', async () => {
    const exported: ReadableSpan[] = [];
    const otel = createOtelSDK({
      serviceName: 'test-service',
      traceExporter: collectingExporter(exported),
      autoInstrumentations: false,
      flushOnShutdown: true,
    });
    otel.start();

    const span = trace.getTracer('test').startSpan('GET /auth/invoke-token/magic/name_secret', {
      attributes: {
        'url.full': 'https://api.example.com/auth/invoke-token/magic/path_secret?page=2',
        'url.path': '/api/auth/invoke-token/invitation/path_secret_2',
        'url.query': 'token=query_secret&page=2',
        'http.target': '/auth/github/callback?code=code_secret&state=state_secret',
        'db.connection_string': 'postgresql://app:password_secret@10.0.0.5/db',
        'http.request.header.referer': ['https://app.example.com/x?access_token=header_secret'],
      },
    });
    span.addEvent('exception', {
      'exception.message': 'fetch https://m.example/send?access_token=event_secret failed',
    });
    span.setStatus({ code: SpanStatusCode.ERROR, message: 'unsubscribe /me/unsubscribe?token=status_secret' });
    span.end();
    await otel.shutdown();

    expect(exported).toHaveLength(1);
    const text = exportedText(exported);
    for (const secret of [
      'name_secret',
      'path_secret',
      'query_secret',
      'code_secret',
      'state_secret',
      'password_secret',
      'header_secret',
      'event_secret',
      'status_secret',
    ]) {
      expect(text).not.toContain(secret);
    }
    // Positive control: routes and harmless parameters survive, so traces stay useful.
    const [redacted] = exported;
    expect(redacted?.name).toBe('GET /auth/invoke-token/magic/[REDACTED]');
    expect(redacted?.attributes['url.full']).toBe('https://api.example.com/auth/invoke-token/magic/[REDACTED]?page=2');
    expect(redacted?.attributes['url.query']).toBe('token=[REDACTED]&page=2');
  });

  it('must not export the values of a failed query via an exception event or the status', async () => {
    const exported: ReadableSpan[] = [];
    const otel = createOtelSDK({
      serviceName: 'test-service',
      traceExporter: collectingExporter(exported),
      autoInstrumentations: false,
      flushOnShutdown: true,
    });
    otel.start();

    // Built at run time: the test proves this value never reaches the exporter.
    const secret = `secret_${crypto.randomUUID()}`;
    const sql = 'select "id" from "sessions" where "sessions"."secret" = $1';
    // Drizzle's DrizzleQueryError: the SQL and every bound value in the message, and so in the stack.
    const failed = Object.assign(new Error(`Failed query: ${sql}\nparams: ${secret},\n${secret}`), {
      name: 'DrizzleQueryError',
    });
    // An error that took over the failed query's stack, as an AppError built from `originalError` does.
    const wrapper = Object.assign(new Error('Could not sign in'), { stack: failed.stack });
    const span = trace.getTracer('test').startSpan('POST /auth/sign-in');
    span.recordException(failed);
    span.recordException(wrapper);
    span.setStatus({ code: SpanStatusCode.ERROR, message: failed.message });
    span.end();
    await otel.shutdown();

    const text = exportedText(exported);
    expect(text).not.toContain(secret);
    expect(text).not.toContain(sql);
    // Positive control: both exceptions are recorded, by type, with their stack frames.
    const events = exported[0]?.events ?? [];
    expect(events.map((event) => event.attributes?.['exception.type'])).toEqual(['DrizzleQueryError', 'Error']);
    expect(events[0]?.attributes?.['exception.message']).toBe('Failed query: [REDACTED]');
    expect(events[0]?.attributes?.['exception.stacktrace']).toMatch(
      /^DrizzleQueryError: Failed query: \[REDACTED\]\n {4}at /,
    );
    expect(events[1]?.attributes?.['exception.message']).toBe('Could not sign in');
    expect(exported[0]?.status.message).toBe('Failed query: [REDACTED]');
  });

  it('redacts before any other span processor reads the span', async () => {
    const seenUrls: unknown[] = [];
    const reader: SpanProcessor = {
      onStart: () => {},
      onEnd: (span) => seenUrls.push(span.attributes['url.full']),
      forceFlush: async () => {},
      shutdown: async () => {},
    };
    const otel = createOtelSDK({ serviceName: 'test-service', spanProcessors: [reader], autoInstrumentations: false });
    otel.start();

    trace
      .getTracer('test')
      .startSpan('GET', { attributes: { 'url.full': 'https://api.example.com/me/unsubscribe?token=early_secret' } })
      .end();

    expect(seenUrls).toEqual(['https://api.example.com/me/unsubscribe?token=[REDACTED]']);
    await otel.shutdown();
  });

  it('must not export a token via an instrumented outbound request', async () => {
    const server = createServer((_req, res) => res.end('{}'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const exported: ReadableSpan[] = [];
    const otel = createOtelSDK({
      serviceName: 'test-service',
      traceExporter: collectingExporter(exported),
      flushOnShutdown: true,
    });
    otel.start();

    try {
      await fetch(`http://127.0.0.1:${port}/_matrix/client/v3/rooms/r/send/m.room.message/1?access_token=fetch_secret`);
      await fetch(`http://127.0.0.1:${port}/auth/invoke-token/magic/fetch_path_secret`);
      await otel.shutdown();
    } finally {
      server.close();
    }

    // Positive control: the fetch instrumentation recorded both requests with their full URL.
    const clientUrls = exported.map((span) => span.attributes['url.full']).filter(Boolean);
    expect(clientUrls).toEqual(
      expect.arrayContaining([
        `http://127.0.0.1:${port}/_matrix/client/v3/rooms/r/send/m.room.message/1?access_token=[REDACTED]`,
        `http://127.0.0.1:${port}/auth/invoke-token/magic/[REDACTED]`,
      ]),
    );
    const text = exportedText(exported);
    expect(text).not.toContain('fetch_secret');
    expect(text).not.toContain('fetch_path_secret');
  });
});
