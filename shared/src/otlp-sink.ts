/** The three OpenTelemetry signals a process exports. */
export type OtlpSignal = 'traces' | 'metrics' | 'logs';

/** Exporter options for one signal. Empty when the exporter reads the standard `OTEL_EXPORTER_OTLP_*` variables itself. */
export type OtlpSink = (signal: OtlpSignal) => { url?: string; headers?: Record<string, string> };

/** The variables `resolveOtlpSink` reads. */
export interface OtlpSinkEnv {
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
}

/**
 * Where a process exports its telemetry, or undefined when export is off. The OTel exporters read
 * `OTEL_EXPORTER_OTLP_ENDPOINT` and its sibling variables (headers, per-signal endpoints) from the environment
 * themselves and take no options.
 */
export function resolveOtlpSink(env: OtlpSinkEnv): OtlpSink | undefined {
  return env.OTEL_EXPORTER_OTLP_ENDPOINT ? () => ({}) : undefined;
}
