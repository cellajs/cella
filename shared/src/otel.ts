import process from 'node:process';
import { context, DiagConsoleLogger, diag, propagation, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  CompositePropagator,
  diagLogLevelFromString,
  getNumberFromEnv,
  getStringFromEnv,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { LoggerProvider, type LogRecordExporter, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import type { MeterProvider } from '@opentelemetry/sdk-metrics';
import { PeriodicExportingMetricReader, MeterProvider as SdkMeterProvider } from '@opentelemetry/sdk-metrics';
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  BatchSpanProcessor,
  ParentBasedSampler,
  type Sampler,
  type SpanExporter,
  type SpanProcessor,
  TraceIdRatioBasedSampler,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { appConfig } from './config-builder/app-config.ts';
import { serviceResource } from './otel-resource.ts';
import type { OtlpSignal, OtlpSink } from './otlp-sink.ts';
import { createRedactingSpanProcessor } from './tracing/redacting-span-processor.ts';

/**
 * The instrumentations this stack has something to instrument: node:http, fetch through undici, and
 * postgres queries. `getNodeAutoInstrumentations()` adds dozens that target databases and frameworks
 * nothing here runs, each patching module loading at boot and producing no spans. Adding one means
 * a line here plus a dependency in each workspace whose bundle keeps @opentelemetry external.
 *
 * Pino is deliberately absent: `createLogger` in ./pino.ts already stamps trace_id and span_id onto
 * every line through its `mixin`, which is what instrumentation-pino would add.
 */
const instrumentations = () => [new HttpInstrumentation(), new UndiciInstrumentation(), new PgInstrumentation()];

const exportOffMsg = '[otel] no OTEL_EXPORTER_OTLP_ENDPOINT or MAPLE_SECRET_INGEST_KEY set: telemetry export is off';

/** The sampler `OTEL_TRACES_SAMPLER` and `OTEL_TRACES_SAMPLER_ARG` name; unset, the provider's default (parent-based, always on). */
const samplerFromEnv = (): Sampler | undefined => {
  const ratio = () => {
    const value = getNumberFromEnv('OTEL_TRACES_SAMPLER_ARG');
    return value !== undefined && value >= 0 && value <= 1 ? value : 1;
  };
  switch (getStringFromEnv('OTEL_TRACES_SAMPLER')) {
    case 'always_on':
      return new AlwaysOnSampler();
    case 'always_off':
      return new AlwaysOffSampler();
    case 'parentbased_always_on':
      return new ParentBasedSampler({ root: new AlwaysOnSampler() });
    case 'parentbased_always_off':
      return new ParentBasedSampler({ root: new AlwaysOffSampler() });
    case 'traceidratio':
      return new TraceIdRatioBasedSampler(ratio());
    case 'parentbased_traceidratio':
      return new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(ratio()) });
    default:
      return undefined;
  }
};

export interface OtelSDKOptions {
  serviceName: string;
  /** Release identifier reported as `service.version`; left off the resource when absent. */
  serviceVersion?: string;
  /** Where traces, metrics and logs go, from `resolveOtlpSink`. Absent, nothing is exported. */
  sink?: OtlpSink;
  /** Metric export interval in ms (default: 5000). */
  metricIntervalMs?: number;
  /** Flush exporters on shutdown. Defaults false in development for fast hot restarts. */
  flushOnShutdown?: boolean;
  /** Enable the instrumentations `instrumentations()` lists (default: true). Set false for workers without HTTP. */
  autoInstrumentations?: boolean;
  /** Additional span processors (e.g. SpanStoreProcessor for devtools/debug logging). */
  spanProcessors?: SpanProcessor[];
  /** Receives finished spans. Defaults to an OTLP exporter for the sink; tests pass an in-memory one. */
  traceExporter?: SpanExporter;
}

export interface OtelSDK {
  /** The trace pipeline; absent when nothing is exported and no local span processor is set. */
  tracerProvider: TracerProvider | undefined;
  meterProvider: MeterProvider;
  start: () => void;
  shutdown: () => Promise<void>;
  verifyConnection: () => Promise<void>;
}

/**
 * Tracer provider plus MeterProvider for one service. Backend, CDC and YJS share this exporter configuration.
 * `start()` registers what the OpenTelemetry Node SDK registers for this setup: the instrumentations, an
 * AsyncLocalStorage context, W3C trace-context and baggage propagation, and the provider. Traces and metrics carry
 * `serviceResource`; logs reach the sink through the pino transport (`otel-log-transport.ts`), which builds the same.
 *
 * @example
 * const otel = createOtelSDK({ serviceName: `${appConfig.slug}-api`, sink: resolveOtlpSink(env) });
 * otel.start();
 * // on shutdown: await otel.shutdown();
 */
export function createOtelSDK(options: OtelSDKOptions): OtelSDK {
  const {
    serviceName,
    serviceVersion,
    sink,
    metricIntervalMs = 5000,
    flushOnShutdown = appConfig.mode !== 'development',
    autoInstrumentations = true,
    spanProcessors = [],
  } = options;

  const exportTimeoutMs = appConfig.mode === 'development' ? 1000 : 10000;
  const metricExportIntervalMs = Math.max(metricIntervalMs, exportTimeoutMs);

  const resource = serviceResource({
    [ATTR_SERVICE_NAME]: serviceName,
    ...(serviceVersion && { [ATTR_SERVICE_VERSION]: serviceVersion }),
    // OTel semantic convention: reports the deploy environment.
    'deployment.environment.name': appConfig.mode,
  });

  // Defined only with a sink, so an undefined `exporterOptions` is this function's single signal that export is off.
  const exporterOptions = sink ? (signal: OtlpSignal) => ({ ...sink(signal), timeoutMillis: exportTimeoutMs }) : undefined;

  const metricReader = exporterOptions
    ? new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(exporterOptions('metrics')),
        exportIntervalMillis: metricExportIntervalMs,
        exportTimeoutMillis: exportTimeoutMs,
      })
    : undefined;

  // Always present, with no readers when export is off, so callers register gauges
  // unconditionally and reader-less observations go nowhere.
  const meterProvider = new SdkMeterProvider({ readers: metricReader ? [metricReader] : [], resource });

  const traceExporter = options.traceExporter ?? (exporterOptions ? new OTLPTraceExporter(exporterOptions('traces')) : undefined);

  // No trace pipeline when there is nothing to export and no local span processor.
  if (!traceExporter && spanProcessors.length === 0) {
    return {
      tracerProvider: undefined,
      meterProvider,
      start: () => {},
      shutdown: () => (flushOnShutdown ? meterProvider.shutdown() : Promise.resolve()),
      verifyConnection: async () => {
        console.info(exportOffMsg);
      },
    };
  }

  // Probes the log path in `verifyConnection`; the logs themselves go out through the pino transport.
  const logExporter = exporterOptions ? new OTLPLogExporter(exporterOptions('logs')) : undefined;

  // Stable HTTP semantic attributes, chosen before instrumentation is constructed and never
  // overriding an explicit environment value.
  if (autoInstrumentations) {
    // biome-ignore lint/style/noProcessEnv: the OTel SDK reads this env var itself; writing it is the only way to pass the setting through
    process.env.OTEL_SEMCONV_STABILITY_OPT_IN ??= 'http';
  }

  const otelLogLevel = getStringFromEnv('OTEL_LOG_LEVEL');
  if (otelLogLevel) diag.setLogger(new DiagConsoleLogger(), { logLevel: diagLogLevelFromString(otelLogLevel) });

  // Constructed now so they hook module loading before the services import http, undici and pg.
  const instrumentationList = autoInstrumentations ? instrumentations() : [];

  const tracerProvider = new TracerProvider({
    resource,
    sampler: samplerFromEnv(),
    // Redaction runs first, so every later processor and the exporter read the scrubbed span.
    spanProcessors: [
      createRedactingSpanProcessor(),
      ...spanProcessors,
      ...(traceExporter ? [new BatchSpanProcessor({ exporter: traceExporter })] : []),
    ],
  });

  function start(): void {
    registerInstrumentations({ instrumentations: instrumentationList });
    const contextManager = new AsyncLocalStorageContextManager();
    contextManager.enable();
    context.setGlobalContextManager(contextManager);
    propagation.setGlobalPropagator(new CompositePropagator({ propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()] }));
    trace.setGlobalTracerProvider(tracerProvider);
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
    await runWithTimeout(Promise.all([tracerProvider.shutdown(), meterProvider.shutdown()]), 'shutdown');
  }

  async function verifyConnection(): Promise<void> {
    if (!traceExporter || !logExporter) {
      console.info(exportOffMsg);
      return;
    }
    try {
      // The processor does not await its export and hands a failure to OTel's global error handler, which logs
      // nothing by default, so the probe taps the exporter callback to read the real result.
      const result = await new Promise<{ code: number; error?: Error }>((resolve) => {
        const probeExporter: LogRecordExporter = {
          export: (records, done) =>
            logExporter.export(records, (exportResult) => {
              done(exportResult);
              resolve(exportResult);
            }),
          forceFlush: () => Promise.resolve(),
          shutdown: () => Promise.resolve(),
        };
        const verifyLogProvider = new LoggerProvider({
          resource,
          processors: [new SimpleLogRecordProcessor({ exporter: probeExporter })],
        });
        verifyLogProvider.getLogger(serviceName).emit({
          // Matches the pino transport (lowercase label plus numeric severity), so the sink
          // groups these probes with application logs. 9 is OTel SeverityNumber.INFO, inlined to
          // avoid a runtime dependency on @opentelemetry/api-logs.
          severityNumber: 9,
          severityText: 'info',
          body: `[otel] ${serviceName} initialized`,
        });
      });
      // Logs nothing on success; 0 is ExportResultCode.SUCCESS, inlined like the severity above.
      if (result.code !== 0) throw result.error ?? new Error('export rejected');
    } catch (err) {
      console.error(`[otel] ${serviceName}: Failed to export to ingest:`, err instanceof Error ? err.message : err);
    }
  }

  return { tracerProvider, meterProvider, start, shutdown, verifyConnection };
}
