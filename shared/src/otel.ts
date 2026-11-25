import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { context, DiagConsoleLogger, diag, propagation, SpanKind, type TextMapPropagator, trace } from '@opentelemetry/api';
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
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { LoggerProvider, type LogRecordExporter, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import type { MeterProvider } from '@opentelemetry/sdk-metrics';
import { AggregationTemporality, InstrumentType, PeriodicExportingMetricReader, MeterProvider as SdkMeterProvider } from '@opentelemetry/sdk-metrics';
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  BatchSpanProcessor,
  ParentBasedSampler,
  type Sampler,
  SamplingDecision,
  type SpanExporter,
  type SpanProcessor,
  TraceIdRatioBasedSampler,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { ATTR_SERVICE_INSTANCE_ID, ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { appConfig } from './config-builder/app-config.ts';
import { serviceResource } from './otel-resource.ts';
import type { OtlpSignal, OtlpSink } from './otlp-sink.ts';
import { type ObservedPool, registerPoolMetrics } from './pool-metrics.ts';
import { registerProcessMetrics } from './process-metrics.ts';
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

// One id per process, shared by every SDK it makes: a monitor tells two machines of one service apart by it.
const serviceInstanceId = randomUUID();

// An observable gauge exports what its last callback observed. Cumulative, the SDK exports a value at every
// collection after its last observation, such as a dropped replication slot's, or one from before a failed read.
class LatestGaugeExporter extends OTLPMetricExporter {
  override selectAggregationTemporality(instrumentType: InstrumentType): AggregationTemporality {
    if (instrumentType === InstrumentType.OBSERVABLE_GAUGE) return AggregationTemporality.DELTA;
    return super.selectAggregationTemporality(instrumentType);
  }
}

// A caller's baggage reaches this service's spans and no outgoing request. A browser's entries never travel on to
// a third party.
const baggagePropagator = new W3CBaggagePropagator();
const inboundBaggagePropagator: TextMapPropagator = {
  inject: () => {},
  extract: (activeContext, carrier, getter) => baggagePropagator.extract(activeContext, carrier, getter),
  fields: () => [],
};

// A caller outside cannot switch a request's records off. A browser SDK that records no traces of its own flags its
// `traceparent` not sampled, and the request's span is still the record of who made it.
/** Records a request this service serves whatever its caller's flag; any other span keeps its remote sender's choice. */
const requestsRecorded: Sampler = {
  shouldSample: (_context, _traceId, _name, kind) => ({
    decision: kind === SpanKind.SERVER ? SamplingDecision.RECORD_AND_SAMPLED : SamplingDecision.NOT_RECORD,
  }),
  toString: () => 'RequestsRecorded',
};

/**
 * The sampler `OTEL_TRACES_SAMPLER` and `OTEL_TRACES_SAMPLER_ARG` name. Unset, every trace this service starts is
 * recorded, a parent's choice is kept, and an incoming request whose caller flags its trace not sampled is recorded.
 */
const samplerFromEnv = (): Sampler => {
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
      return new ParentBasedSampler({ root: new AlwaysOnSampler(), remoteParentNotSampled: requestsRecorded });
  }
};

export interface OtelSDKOptions {
  serviceName: string;
  /** Release identifier reported as `service.version`; left off the resource when absent. */
  serviceVersion?: string;
  /** Where traces, metrics and logs go, from `resolveOtlpSink`. Absent, nothing is exported. */
  sink?: OtlpSink;
  /** Metric export interval in ms (default: 60000, 5000 in development); `OTEL_METRIC_EXPORT_INTERVAL` wins. */
  metricIntervalMs?: number;
  /** Flush exporters on shutdown. Defaults false in development for fast hot restarts. */
  flushOnShutdown?: boolean;
  /** Enable the instrumentations `instrumentations()` lists (default: true). Set false for workers without HTTP. */
  autoInstrumentations?: boolean;
  /** Additional span processors (e.g. SpanStoreProcessor for devtools/debug logging). */
  spanProcessors?: SpanProcessor[];
  // The pool's connections, which instrumentation-pg miscounts once a process holds two pools.
  /** The service's main database pool, whose connections `start()` reports. */
  pool?: ObservedPool;
  /** Receives finished spans. Defaults to an OTLP exporter for the sink; tests pass an in-memory one. */
  traceExporter?: SpanExporter;
}

export interface OtelSDK {
  /** The trace pipeline; absent when nothing is exported and no local span processor is set. */
  tracerProvider: TracerProvider | undefined;
  meterProvider: MeterProvider;
  // A callback that reads elsewhere fits its read in this.
  /** Milliseconds a metric callback may run before its collection goes on without it. */
  callbackTimeoutMs: number;
  start: () => void;
  shutdown: () => Promise<void>;
  verifyConnection: () => Promise<void>;
}

/**
 * Tracer provider plus MeterProvider for one service. Backend, CDC and YJS share this exporter configuration.
 * `start()` registers what the OpenTelemetry Node SDK registers for this setup: the instrumentations, an
 * AsyncLocalStorage context, W3C trace-context propagation, incoming baggage, and the provider. Traces and metrics carry
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
    // A minute, the finest step a monitor keeps a series in.
    metricIntervalMs = appConfig.mode === 'development' ? 5000 : 60_000,
    flushOnShutdown = appConfig.mode !== 'development',
    autoInstrumentations = true,
    spanProcessors = [],
    pool,
  } = options;

  const exportTimeoutMs = appConfig.mode === 'development' ? 1000 : 10000;
  // Every export gzipped: a full batch of 512 spans with stack traces then stays far under a
  // receiver's 1 MiB body limit. Set before the exporters are made; an explicit environment value wins.
  // biome-ignore lint/style/noProcessEnv: the OTel exporters read this env var themselves; writing it is the only way to pass the setting through
  process.env.OTEL_EXPORTER_OTLP_COMPRESSION ??= 'gzip';
  // The standard variable, which the reader leaves to the Node SDK, is read here. An export never outlasts the interval.
  const intervalFromEnv = getNumberFromEnv('OTEL_METRIC_EXPORT_INTERVAL');
  const metricExportIntervalMs = intervalFromEnv !== undefined && intervalFromEnv > 0 ? intervalFromEnv : metricIntervalMs;

  const resource = serviceResource({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_INSTANCE_ID]: serviceInstanceId, // The process's id on its traces and metrics.
    ...(serviceVersion && { [ATTR_SERVICE_VERSION]: serviceVersion }),
    // OTel semantic convention: reports the deploy environment.
    'deployment.environment.name': appConfig.mode,
  });

  // Defined only with a sink, so an undefined `exporterOptions` is this function's single signal that export is off.
  const exporterOptions = sink ? (signal: OtlpSignal) => ({ ...sink(signal), timeoutMillis: exportTimeoutMs }) : undefined;

  // The reader hands each metric callback this much of the export timeout.
  const callbackTimeoutMs = Math.min(exportTimeoutMs, metricExportIntervalMs);
  const metricReader = exporterOptions
    ? new PeriodicExportingMetricReader({
        exporter: new LatestGaugeExporter(exporterOptions('metrics')),
        exportIntervalMillis: metricExportIntervalMs,
        exportTimeoutMillis: callbackTimeoutMs,
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
      callbackTimeoutMs,
      start: () => {},
      shutdown: () => (flushOnShutdown ? meterProvider.shutdown() : Promise.resolve()),
      verifyConnection: async () => console.info(exportOffMsg),
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
    // A process reports its runtime, itself and its pool once, under one service name. Only the SDK a process
    // starts measures them, while metrics are exported: an API that folds workers in starts its own alone.
    if (metricReader) {
      new RuntimeNodeInstrumentation().setMeterProvider(meterProvider);
      registerProcessMetrics(meterProvider.getMeter('process'));
      if (pool) registerPoolMetrics(meterProvider.getMeter('db-pool'), pool);
    }
    const contextManager = new AsyncLocalStorageContextManager();
    contextManager.enable();
    context.setGlobalContextManager(contextManager);
    propagation.setGlobalPropagator(new CompositePropagator({ propagators: [new W3CTraceContextPropagator(), inboundBaggagePropagator] }));
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

  return { tracerProvider, meterProvider, callbackTimeoutMs, start, shutdown, verifyConnection };
}
