/** App-owned telemetry sink: where deploy and boot audit events ship when no explicit OTEL_EXPORTER_OTLP_* env is set. The engine knows only this shape, and the boot runner receives the values via the boot plan. */
export interface TelemetrySinkConfig {
  /** OTLP-compatible ingest endpoint (no trailing slash). */
  endpoint: string;
  /** HTTP header carrying the ingest key. */
  keyHeader: string;
  /** Env var the ingest key travels in (VM .env.runtime + process env). */
  keyEnvVar: string;
  /** Secret Manager container name holding the operator-seeded ingest key. */
  keySecretName: string;
}

export const telemetrySink: TelemetrySinkConfig = {
  endpoint: 'https://ingest.maple.dev/v1',
  keyHeader: 'x-maple-ingest-key',
  keyEnvVar: 'MAPLE_SECRET_INGEST_KEY',
  keySecretName: 'maple-secret-ingest-key',
};
