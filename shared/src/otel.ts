import process from 'node:process';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import type { MeterProvider } from '@opentelemetry/sdk-metrics';
import { PeriodicExportingMetricReader, MeterProvider as SdkMeterProvider } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { appConfig } from './config-builder/app-config.ts';

/**
 * The instrumentations this stack has something to instrument: node:http, fetch through undici, and
 * postgres queries. `getNodeAutoInstrumentations()` covers these too, but installs 41 instrumentation
 * packages to do it; the other 37 target databases and frameworks nothing here runs (mongodb, mysql,
 * kafka, express, grpc and so on). Each one patches module loading when the SDK starts, so those 37
 * add 146 packages that every service loads at boot and that produce no spans. Adding one back means
 * a line here plus a dependency in each workspace whose bundle keeps @opentelemetry external.
 *
 * Pino is deliberately absent: `createLogger` in ./pino.ts already stamps trace_id and span_id onto
 * every line through its `mixin`, which is what instrumentation-pino would add.
 */
const instrumentations = () => [new HttpInstrumentation(), new UndiciInstrumentation(), new PgInstrumentation()];

const MAPLE_INGEST_BASE = 'https://ingest.maple.dev/v1';
const MAPLE_DISABLED_MSG = '[otel] MAPLE_SECRET_INGEST_KEY not set: skipping Maple.dev';

export interface OtelSDKOptions {
  serviceName: string;
  serviceVersion?: string;
  mapleSecretIngestKey?: string;
  /** Metric export interval in ms (default: 5000). */
  metricIntervalMs?: number;
  /** Flush exporters on shutdown. Defaults false in development for fast hot restarts. */
  flushOnShutdown?: boolean;
  /** Enable the instrumentations below (default: true). Set false for workers without HTTP. */
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

/**
 * NodeSDK plus MeterProvider for one service. Backend, CDC and YJS share this Maple.dev exporter
 * configuration.
 *
 * @example
 * const otel = createOtelSDK({ serviceName: 'raak-development-api', mapleSecretIngestKey: env.MAPLE_SECRET_INGEST_KEY });
 * otel.start();
 * // on shutdown: await otel.shutdown();
 */
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
  const metricExportIntervalMs = Math.max(metricIntervalMs, exportTimeoutMs);

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
    // OTel semantic convention: reports the deploy environment to Maple.
    'deployment.environment.name': appConfig.mode,
  });

  // Defined only when an ingest key is present, so an undefined `hasMaple` is this function's
  // single signal that telemetry export is off.
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
        exportIntervalMillis: metricExportIntervalMs,
        exportTimeoutMillis: exportTimeoutMs,
      })
    : undefined;

  // Always present, with no readers when export is off, so callers register gauges
  // unconditionally and reader-less observations go nowhere.
  const meterProvider = new SdkMeterProvider({
    readers: metricReader ? [metricReader] : [],
    resource,
  });

  // Skip NodeSDK startup when there is nothing to export and no local span processor.
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

  // Stable HTTP semantic attributes, chosen before instrumentation is constructed and never
  // overriding an explicit environment value.
  if (autoInstrumentations) {
    // biome-ignore lint/style/noProcessEnv: the OTel SDK reads this env var itself; writing it is the only way to pass the setting through
    process.env.OTEL_SEMCONV_STABILITY_OPT_IN ??= 'http';
  }

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    logRecordProcessors: logExporter ? [new SimpleLogRecordProcessor({ exporter: logExporter })] : [],
    // Metrics are owned by the explicit meterProvider above. Without this, NodeSDK
    // creates a second env-driven OTLP metrics reader that can block hot restarts.
    metricReaders: [],
    instrumentations: autoInstrumentations ? instrumentations() : [],
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
        processors: [new SimpleLogRecordProcessor({ exporter: logExporter })],
      });
      const logger = verifyLogProvider.getLogger(serviceName);
      logger.emit({
        // Matches pino-opentelemetry-transport (lowercase label plus numeric severity), so Maple
        // groups these probes with application logs. 9 is OTel SeverityNumber.INFO, inlined to
        // avoid a runtime dependency on @opentelemetry/api-logs.
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
