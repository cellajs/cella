import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node';
import { processDetector, resourceFromAttributes } from '@opentelemetry/resources';
import { SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { appConfig } from 'shared';
import { env } from './env';

/**
 * In-memory metric exporter for reading OTel metrics via API.
 * Use `metricExporter.getMetrics()` to retrieve collected metrics.
 */
export const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);

/**
 * Metric reader that periodically collects metrics from all registered instruments.
 */
const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 5000, // Collect every 5 seconds
});

/**
 * MeterProvider for OTel metrics collection.
 * Provides meters for creating custom metrics and collects runtime metrics.
 */
export const meterProvider = new MeterProvider({
  readers: [metricReader],
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: appConfig.name,
    [ATTR_SERVICE_VERSION]: '1.0',
  }),
});

/**
 * OpenTelemetry SDK configuration.
 * HTTP instrumentation is handled by @hono/otel middleware for route-aware spans.
 * RuntimeNodeInstrumentation provides Node.js metrics (event loop utilization, etc.).
 */
export const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: appConfig.name,
    [ATTR_SERVICE_VERSION]: '1.0',
  }),
  resourceDetectors: [processDetector],
  traceExporter: new ConsoleSpanExporter(),
  instrumentations: [
    // Node.js runtime metrics (event loop utilization, GC, heap)
    new RuntimeNodeInstrumentation({
      monitoringPrecision: 5000, // 5 second intervals
    }),
  ],
});

// Maple.dev observability
const mapleApiKey = env.MAPLE_API_KEY;

const mapleTraceExporter = mapleApiKey
  ? new OTLPTraceExporter({
      url: 'https://ingest.maple.dev/v1/traces',
      headers: { 'x-api-key': mapleApiKey },
    })
  : undefined;

const mapleLogExporter = mapleApiKey
  ? new OTLPLogExporter({
      url: 'https://ingest.maple.dev/v1/logs',
      headers: { 'x-api-key': mapleApiKey },
    })
  : undefined;

export const maple = mapleApiKey
  ? new NodeSDK({
      traceExporter: mapleTraceExporter,
      logRecordProcessors: mapleLogExporter ? [new SimpleLogRecordProcessor(mapleLogExporter)] : [],
      instrumentations: [getNodeAutoInstrumentations()],
    })
  : undefined;

/**
 * Verify Maple.dev connectivity by sending a test trace export.
 * Logs success or failure to stderr so you can confirm it's working.
 */
export async function verifyMapleConnection() {
  if (!mapleTraceExporter) {
    console.info('[maple] MAPLE_API_KEY not set — skipping Maple.dev');
    return;
  }
  try {
    await mapleTraceExporter.forceFlush();
    console.info('[maple] Connected to Maple.dev — traces and logs are being exported');
  } catch (err) {
    console.error('[maple] Failed to connect to Maple.dev:', err instanceof Error ? err.message : err);
  }
}
