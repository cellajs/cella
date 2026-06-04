/**
 * Shared OpenTelemetry SDK factory.
 *
 * Creates a configured NodeSDK + MeterProvider for any service.
 * Centralizes Maple.dev exporter config so backend, CDC, and YJS share one source of truth.
 *
 * Usage:
 *   const otel = createOtelSDK({ serviceName: 'raak-development-api', mapleApiKey: env.MAPLE_API_KEY });
 *   otel.start();
 *   // on shutdown: await otel.shutdown();
 */

import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import type { MeterProvider } from '@opentelemetry/sdk-metrics';
import { PeriodicExportingMetricReader, MeterProvider as SdkMeterProvider } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';

const MAPLE_INGEST_BASE = 'https://ingest.maple.dev/v1';

export interface OtelSDKOptions {
  serviceName: string;
  serviceVersion?: string;
  mapleApiKey?: string;
  /** Metric export interval in ms (default: 5000). */
  metricIntervalMs?: number;
  /** Enable auto-instrumentations (default: true). Set false for workers without HTTP. */
  autoInstrumentations?: boolean;
  /** Additional span processors (e.g. SpanStoreProcessor for devtools/debug logging). */
  spanProcessors?: SpanProcessor[];
}

export interface OtelSDK {
  sdk: NodeSDK | undefined;
  meterProvider: MeterProvider;
  start: () => void;
  shutdown: () => Promise<void>;
  verifyConnection: () => Promise<void>;
}

export function createOtelSDK(options: OtelSDKOptions): OtelSDK {
  const {
    serviceName,
    serviceVersion = '1.0',
    mapleApiKey,
    metricIntervalMs = 5000,
    autoInstrumentations = true,
    spanProcessors = [],
  } = options;

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
  });

  // Metric exporter (always created — falls back to default OTLP endpoint without Maple key)
  const metricExporter = mapleApiKey
    ? new OTLPMetricExporter({
        url: `${MAPLE_INGEST_BASE}/metrics`,
        headers: { 'x-maple-ingest-key': mapleApiKey },
      })
    : new OTLPMetricExporter();

  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: metricIntervalMs,
  });

  const meterProvider = new SdkMeterProvider({
    readers: [metricReader],
    resource,
  });

  // Trace + log exporters (Maple-only)
  const traceExporter = mapleApiKey
    ? new OTLPTraceExporter({
        url: `${MAPLE_INGEST_BASE}/traces`,
        headers: { 'x-maple-ingest-key': mapleApiKey },
      })
    : undefined;

  const logExporter = mapleApiKey
    ? new OTLPLogExporter({
        url: `${MAPLE_INGEST_BASE}/logs`,
        headers: { 'x-maple-ingest-key': mapleApiKey },
      })
    : undefined;

  // NodeSDK (only when Maple key is present or span processors are registered)
  const sdk = (mapleApiKey || spanProcessors.length > 0)
    ? new NodeSDK({
        resource,
        traceExporter,
        logRecordProcessors: logExporter ? [new SimpleLogRecordProcessor(logExporter)] : [],
        instrumentations: autoInstrumentations ? [getNodeAutoInstrumentations()] : [],
        spanProcessors,
      })
    : undefined;

  function start(): void {
    sdk?.start();
  }

  async function shutdown(): Promise<void> {
    await sdk?.shutdown();
    await meterProvider.shutdown();
  }

  async function verifyConnection(): Promise<void> {
    if (!traceExporter || !logExporter) {
      console.info('[otel] MAPLE_API_KEY not set — skipping Maple.dev');
      return;
    }
    try {
      const verifyLogProvider = new LoggerProvider({
        resource,
        processors: [new SimpleLogRecordProcessor(logExporter)],
      });
      const logger = verifyLogProvider.getLogger(serviceName);
      logger.emit({
        severityText: 'INFO',
        body: `[otel] ${serviceName} initialized`,
      });
      await verifyLogProvider.forceFlush();
      console.info(`[otel] ${serviceName}: Connected to Maple.dev`);
    } catch (err) {
      console.error(`[otel] ${serviceName}: Failed to export to Maple.dev:`, err instanceof Error ? err.message : err);
    }
  }

  return { sdk, meterProvider, start, shutdown, verifyConnection };
}
