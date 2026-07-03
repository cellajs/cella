/**
 * Shared OpenTelemetry SDK factory.
 *
 * Creates a configured NodeSDK + MeterProvider for any service.
 * Centralizes Maple.dev exporter config so backend, CDC, and YJS share one source of truth.
 *
 * Usage:
 *   const otel = createOtelSDK({ serviceName: 'raak-development-api', mapleSecretIngestKey: env.MAPLE_SECRET_INGEST_KEY });
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
import { appConfig } from './config-builder/app-config';

const MAPLE_INGEST_BASE = 'https://ingest.maple.dev/v1';
const MAPLE_DISABLED_MSG = '[otel] MAPLE_SECRET_INGEST_KEY not set — skipping Maple.dev';

export interface OtelSDKOptions {
  serviceName: string;
  serviceVersion?: string;
  mapleSecretIngestKey?: string;
  /** Metric export interval in ms (default: 5000). */
  metricIntervalMs?: number;
  /** Flush exporters on shutdown. Defaults false in development for fast hot restarts. */
  flushOnShutdown?: boolean;
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
    mapleSecretIngestKey,
    metricIntervalMs = 5000,
    flushOnShutdown = appConfig.mode !== 'development',
    autoInstrumentations = true,
    spanProcessors = [],
  } = options;

  const exportTimeoutMs = appConfig.mode === 'development' ? 1000 : 10000;

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
    // OTel semantic convention: surfaces the deploy environment (development/staging/production/…) in Maple.
    'deployment.environment.name': appConfig.mode,
  });

  // Maple exporter config factory — defined only when an ingest key is present, so `hasMaple`
  // being undefined is the single "telemetry export is off" signal used throughout this function.
  const hasMaple = mapleSecretIngestKey
    ? (signal: 'traces' | 'metrics' | 'logs') => ({
        url: `${MAPLE_INGEST_BASE}/${signal}`,
        headers: { 'x-maple-ingest-key': mapleSecretIngestKey },
        timeoutMillis: exportTimeoutMs,
      })
    : undefined;

  const metricReader = hasMaple
    ? new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(hasMaple('metrics')),
        exportIntervalMillis: metricIntervalMs,
        exportTimeoutMillis: exportTimeoutMs,
      })
    : undefined;

  // The MeterProvider always exists (with no readers when export is off) so callers can register
  // gauges unconditionally; reader-less observations are simply not exported.
  const meterProvider = new SdkMeterProvider({
    readers: metricReader ? [metricReader] : [],
    resource,
  });

  // Nothing to export and no local span processors → return a no-op instead of spinning up a NodeSDK.
  if (!hasMaple && spanProcessors.length === 0) {
    return {
      sdk: undefined,
      meterProvider,
      start: () => {},
      shutdown: () => (flushOnShutdown ? meterProvider.shutdown() : Promise.resolve()),
      verifyConnection: async () => {
        console.info(MAPLE_DISABLED_MSG);
      },
    };
  }

  const traceExporter = hasMaple ? new OTLPTraceExporter(hasMaple('traces')) : undefined;
  const logExporter = hasMaple ? new OTLPLogExporter(hasMaple('logs')) : undefined;

  // Opt into the stable HTTP semantic conventions (http.request.method, http.response.status_code,
  // url.full, server.address, user_agent.original, …) instead of the legacy http.* keys. This is
  // read by @opentelemetry/instrumentation-http at construction, so it must be set before
  // getNodeAutoInstrumentations() runs below. `??=` lets an explicit env override (e.g. 'http/dup') win.
  if (autoInstrumentations) {
    process.env.OTEL_SEMCONV_STABILITY_OPT_IN ??= 'http';
  }

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    logRecordProcessors: logExporter ? [new SimpleLogRecordProcessor(logExporter)] : [],
    // Metrics are owned by the explicit meterProvider above. Without this, NodeSDK
    // creates a second env-driven OTLP metrics reader that can block hot restarts.
    metricReaders: [],
    instrumentations: autoInstrumentations ? [getNodeAutoInstrumentations()] : [],
    spanProcessors,
  });

  function start(): void {
    sdk.start();
  }

  async function runWithTimeout(operation: Promise<unknown>, label: string): Promise<void> {
    const shutdownTimeoutMs = 10_000;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        console.warn(`[otel] ${serviceName}: ${label} timed out after ${shutdownTimeoutMs}ms`);
        resolve();
      }, shutdownTimeoutMs);
      if (typeof timer.unref === 'function') timer.unref();

      operation.then(
        () => {
          clearTimeout(timer);
          resolve();
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

  async function shutdown(): Promise<void> {
    if (!flushOnShutdown) return;
    await runWithTimeout(Promise.all([sdk.shutdown(), meterProvider.shutdown()]), 'shutdown');
  }

  async function verifyConnection(): Promise<void> {
    if (!traceExporter || !logExporter) {
      console.info(MAPLE_DISABLED_MSG);
      return;
    }
    try {
      const verifyLogProvider = new LoggerProvider({
        resource,
        processors: [new SimpleLogRecordProcessor(logExporter)],
      });
      const logger = verifyLogProvider.getLogger(serviceName);
      logger.emit({
        // Match pino-opentelemetry-transport's representation (lowercase label + numeric severity)
        // so Maple groups these probes under the same `info` bucket as application logs.
        // 9 == OTel SeverityNumber.INFO (avoids a runtime dep on @opentelemetry/api-logs).
        severityNumber: 9,
        severityText: 'info',
        body: `[otel] ${serviceName} initialized`,
      });
      await verifyLogProvider.forceFlush();
      console.info(`[otel] ${serviceName}: Connected to ingest`);
    } catch (err) {
      console.error(`[otel] ${serviceName}: Failed to export to ingest:`, err instanceof Error ? err.message : err);
    }
  }

  return { sdk, meterProvider, start, shutdown, verifyConnection };
}
