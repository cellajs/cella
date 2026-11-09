/** The three OpenTelemetry signals a process exports. */
export type OtlpSignal = 'traces' | 'metrics' | 'logs';

/** Exporter options for one signal. Empty when the exporter reads the standard `OTEL_EXPORTER_OTLP_*` variables itself. */
export type OtlpSink = (signal: OtlpSignal) => { url?: string; headers?: Record<string, string> };

/** The variables `resolveOtlpSink` reads. */
export interface OtlpSinkEnv {
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  MAPLE_SECRET_INGEST_KEY?: string;
}

/** Maple.dev's OTLP/HTTP ingest: the destination when only its ingest key is set, and the header that carries the key. */
const mapleIngest = { url: 'https://ingest.maple.dev', keyHeader: 'x-maple-ingest-key' } as const;

/**
 * Where a process exports its telemetry, or undefined when export is off. `OTEL_EXPORTER_OTLP_ENDPOINT` wins: the OTel
 * exporters read it and its sibling variables (headers, per-signal endpoints) from the environment, so they are given no
 * options. With only a Maple ingest key, each signal goes to Maple's endpoint under that key.
 */
export function resolveOtlpSink(env: OtlpSinkEnv): OtlpSink | undefined {
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT) return () => ({});
  const ingestKey = env.MAPLE_SECRET_INGEST_KEY;
  if (!ingestKey) return undefined;
  return (signal) => ({ url: `${mapleIngest.url}/v1/${signal}`, headers: { [mapleIngest.keyHeader]: ingestKey } });
}
