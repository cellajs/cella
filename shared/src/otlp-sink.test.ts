import { describe, expect, it } from 'vitest';
import { resolveOtlpSink } from './otlp-sink.ts';

describe('resolveOtlpSink', () => {
  it('is off when neither variable is set', () => {
    expect(resolveOtlpSink({})).toBeUndefined();
    expect(resolveOtlpSink({ OTEL_EXPORTER_OTLP_ENDPOINT: '', MAPLE_SECRET_INGEST_KEY: '' })).toBeUndefined();
  });

  it('sends each signal to Maple under the ingest key when only that key is set', () => {
    const sink = resolveOtlpSink({ MAPLE_SECRET_INGEST_KEY: 'maple_sk_test' });

    expect(sink?.('traces')).toEqual({ url: 'https://ingest.maple.dev/v1/traces', headers: { 'x-maple-ingest-key': 'maple_sk_test' } });
    expect(sink?.('logs').url).toBe('https://ingest.maple.dev/v1/logs');
  });

  it('leaves the exporters to the standard variables when the OTLP endpoint is set, Maple key or not', () => {
    const sink = resolveOtlpSink({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318', MAPLE_SECRET_INGEST_KEY: 'maple_sk_test' });

    expect(sink?.('metrics')).toEqual({});
  });
});
