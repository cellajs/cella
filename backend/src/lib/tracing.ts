import { propagation } from '@opentelemetry/api';
import type { SpanProcessor } from '@opentelemetry/sdk-trace';
import { createOtelSDK, type OtelSDK } from 'shared/otel';
import { env } from '#/env';
import { otlpSink, serviceName } from '#/lib/otel-env';

/** A browser session id as Sentry's SDK writes it: 32 lowercase hex characters. */
const sessionIdPattern = /^[0-9a-f]{32}$/;

/**
 * Records on a request's spans the browser session that made it, from the `baggage` entry the frontend's API client
 * sends (`frontend/src/lib/monitoring.ts`). The caller writes that entry: only a value of a session id's shape is copied,
 * and no other entry becomes an attribute.
 */
const sessionBaggage: SpanProcessor = {
  onStart: (span, parentContext) => {
    const value = propagation.getBaggage(parentContext)?.getEntry('session.id')?.value;
    if (value && sessionIdPattern.test(value)) span.setAttribute('session.id', value);
  },
  onEnd: () => {},
  forceFlush: () => Promise.resolve(),
  shutdown: () => Promise.resolve(),
};

/**
 * Backend OTel SDK from the shared factory. Every entry that starts it imports this module first, as a bare import: the
 * pg instrumentation it constructs patches only a `pg` loaded after it, and Biome sorts a named import back behind the
 * imports that load `pg`.
 */
export const otel: OtelSDK = createOtelSDK({
  serviceName,
  serviceVersion: env.RELEASE_SHA,
  sink: otlpSink,
  // A local processor alone would start a trace pipeline that exports nothing.
  spanProcessors: otlpSink ? [sessionBaggage] : [],
  // The runtime pool's connections. pg-boss's own pool and the admin pool stay out.
  pool: { name: 'runtime', load: async () => (await import('#/db/db')).baseDb.$client },
});
