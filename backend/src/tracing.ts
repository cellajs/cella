import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node';
import { processDetector, resourceFromAttributes } from '@opentelemetry/resources';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { appConfig } from 'config';

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
