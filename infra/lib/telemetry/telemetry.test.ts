import { describe, expect, it, vi } from 'vitest';
import { telemetrySink } from '../../config/telemetry.config';
import type { FetchLike } from '../utils/fetch-like';
import { createTelemetry, otlpConfigFromEnv } from './emitter';
import { buildEvent, formatTraceparent, newSpanId, newTraceId, parseTraceparent, toKeyValues, unixNano } from './otlp';

describe('otlp builders', () => {
  it('generates well-formed ids and round-trips traceparent', () => {
    const ctx = { traceId: newTraceId(), spanId: newSpanId() };
    expect(ctx.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(ctx.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(parseTraceparent(formatTraceparent(ctx))).toEqual(ctx);
    expect(parseTraceparent('garbage')).toBeUndefined();
    expect(parseTraceparent(undefined)).toBeUndefined();
  });

  it('encodes attributes per OTLP value type', () => {
    expect(toKeyValues({ s: 'x', i: 3, f: 1.5, b: true })).toEqual([
      { key: 's', value: { stringValue: 'x' } },
      { key: 'i', value: { intValue: '3' } },
      { key: 'f', value: { doubleValue: 1.5 } },
      { key: 'b', value: { boolValue: true } },
    ]);
  });

  it('encodes times as unix-nano strings', () => {
    expect(unixNano(1000)).toBe('1000000000');
  });

  it('builds events with the eventName field AND event.name attribute', () => {
    const record = buildEvent({ name: 'deploy.started', timeMs: 1000, attrs: { sha: 'abc' } });
    expect(record.eventName).toBe('deploy.started');
    expect(record.attributes).toContainEqual({ key: 'event.name', value: { stringValue: 'deploy.started' } });
    expect(record.severityText).toBe('info');
  });
});

describe('createTelemetry', () => {
  const fetchOk = () => vi.fn<FetchLike>(async () => new Response('{}', { status: 200 }));

  it('exports spans and events over OTLP/HTTP with headers', async () => {
    const fetchImpl = fetchOk();
    const t = createTelemetry({
      resource: { 'service.name': 'infra-deploy' },
      endpoint: 'https://ingest.example/v1',
      headers: { 'x-key': 'k' },
      fetchImpl,
      now: () => 1000,
    });
    const span = t.startSpan('deploy staging');
    t.event('deploy.started', { sha: 'abc' });
    span.end('ok');
    await t.flush();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const calls = fetchImpl.mock.calls;
    expect(calls[0]?.[0]).toBe('https://ingest.example/v1/traces');
    expect(calls[0]?.[1]?.headers?.['x-key']).toBe('k');
    const tracesBody = JSON.parse(String(calls[0]?.[1]?.body));
    expect(tracesBody.resourceSpans[0].scopeSpans[0].spans[0].name).toBe('deploy staging');
    expect(calls[1]?.[0]).toBe('https://ingest.example/v1/logs');
    expect(JSON.parse(String(calls[1]?.[1]?.body)).resourceLogs[0].scopeLogs[0].logRecords[0].eventName).toBe('deploy.started');
  });

  it('joins a parent traceparent so children correlate to the CI trace', () => {
    const t = createTelemetry({ resource: {}, traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01' });
    expect(t.rootCtx.traceId).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    const span = t.startSpan('step');
    expect(span.ctx.traceId).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('never throws on export failure and reports through onError', async () => {
    const errors: string[] = [];
    const t = createTelemetry({
      resource: {},
      endpoint: 'https://ingest.example/v1',
      fetchImpl: vi.fn(async () => new Response('nope', { status: 500 })),
      onError: (message) => errors.push(message),
    });
    t.event('deploy.failed', {}, { severity: 'error' });
    await expect(t.flush()).resolves.toBeUndefined();
    expect(errors[0]).toMatch(/export failed/);
  });

  it('does not re-export already flushed records', async () => {
    const fetchImpl = fetchOk();
    const t = createTelemetry({ resource: {}, endpoint: 'https://ingest.example/v1', fetchImpl });
    t.event('deploy.started');
    await t.flush();
    await t.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('queues concurrent flushes so a record is exported once, and exports one buffered mid-flush on the next', async () => {
    const fetchImpl = fetchOk();
    const t = createTelemetry({ resource: {}, endpoint: 'https://ingest.example/v1', fetchImpl });
    t.event('boot.step.running');
    const first = t.flush();
    t.event('boot.step.completed');
    await Promise.all([first, t.flush(), t.flush()]);
    const exported = fetchImpl.mock.calls.flatMap(([, init]) =>
      JSON.parse(String(init?.body)).resourceLogs[0].scopeLogs[0].logRecords.map((record: { eventName: string }) => record.eventName),
    );
    expect(exported).toEqual(['boot.step.running', 'boot.step.completed']);
  });

  it('aborts an export the sink never answers, so later flushes still run', async () => {
    vi.useFakeTimers();
    try {
      const errors: string[] = [];
      const hanging = vi.fn<FetchLike>(
        (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
      );
      const t = createTelemetry({
        resource: {},
        endpoint: 'https://ingest.example/v1',
        fetchImpl: hanging,
        exportTimeoutMs: 5_000,
        onError: (m) => errors.push(m),
      });
      t.event('boot.started');
      const flushed = t.flush();
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(flushed).resolves.toBeUndefined();
      expect(errors[0]).toMatch(/export failed: aborted/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('without an endpoint stays build-only: events land in the black-box JSONL', async () => {
    const t = createTelemetry({ resource: {}, now: () => 1000 });
    t.event('boot.failed', { service: 'cdc' }, { severity: 'error' });
    await t.flush();
    const lines = t.eventsJsonl().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '').eventName).toBe('boot.failed');
  });

  it('must not export a secret learned after its record was buffered', async () => {
    const fetchImpl = fetchOk();
    const known = new Set<string>();
    const t = createTelemetry({
      resource: {},
      endpoint: 'https://ingest.example/v1',
      fetchImpl,
      redact: (text) => [...known].reduce((out, secret) => out.split(secret).join('[REDACTED]'), text),
    });
    const span = t.startSpan('boot backend');
    t.event('boot.step.failed', { error: 'dial postgres://app:late-secret@db' }, { body: 'late-secret in body' });
    span.end('error', { message: 'late-secret in status' });
    known.add('late-secret');
    await t.flush();

    const bodies = fetchImpl.mock.calls.map(([, init]) => String(init?.body));
    expect(bodies).toHaveLength(2);
    for (const text of [...bodies, t.eventsJsonl()]) {
      expect(text).not.toContain('late-secret');
      // Positive control: the record itself is exported, only the value is gone.
      expect(text).toContain('[REDACTED]');
    }
  });
});

describe('otlpConfigFromEnv', () => {
  it('prefers explicit OTLP env and parses headers', () => {
    const config = otlpConfigFromEnv({ OTEL_EXPORTER_OTLP_ENDPOINT: 'https://col:4318/', OTEL_EXPORTER_OTLP_HEADERS: 'a=1,b=2' });
    expect(config).toEqual({ endpoint: 'https://col:4318/v1', headers: { a: '1', b: '2' } });
  });

  it('posts each signal under /v1 of the base URL the OTLP variable holds', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => new Response('{}', { status: 200 }));
    const t = createTelemetry({ resource: {}, ...otlpConfigFromEnv({ OTEL_EXPORTER_OTLP_ENDPOINT: 'https://col:4318' }), fetchImpl });
    t.startSpan('step').end();
    t.event('deploy.started');
    await t.flush();
    expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual(['https://col:4318/v1/traces', 'https://col:4318/v1/logs']);
  });

  it('maps the app-configured sink ingest key to the sink endpoint', () => {
    const config = otlpConfigFromEnv({ [telemetrySink.keyEnvVar]: 'mk' });
    expect(config).toEqual({ endpoint: telemetrySink.endpoint, headers: { [telemetrySink.keyHeader]: 'mk' } });
  });

  it('returns undefined when nothing is configured', () => {
    expect(otlpConfigFromEnv({})).toBeUndefined();
  });
});
