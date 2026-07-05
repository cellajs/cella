/**
 * Dev-only frontend tracer.
 *
 * In staging/production the Maple browser SDK owns tracing end-to-end
 * (see lib/maple.ts): its provider registers globally, its fetch
 * instrumentation creates network spans, and every span carries the replay
 * session id. There is deliberately NO parallel provider or OTLP export here.
 *
 * In development (where the SDK is off unless VITE_DEBUG_MODE) this module
 * registers a local WebTracerProvider so the withSpan helpers and the
 * sync-devtools SpanStore keep working. Spans stay local — nothing exports.
 *
 * The exported `tracer` is a ProxyTracer bound to the OTel global API: it
 * resolves against whichever provider registered (dev: local, prod: Maple SDK),
 * so withSpan/reportCriticalError work identically in both environments.
 */
import { trace } from '@opentelemetry/api';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { appConfig } from 'shared';
import { createSpanStore, createSpanStoreProcessor } from 'shared/tracing';
import { mapleEnabled } from './maple-enabled';

// Devtools span ring. Only fed in dev (no processor is attached otherwise).
export const spanStore = createSpanStore({ maxSpans: 500 });

if (!mapleEnabled) {
  const provider = new WebTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: `${appConfig.slug}-frontend`,
      'deployment.environment.name': appConfig.mode,
    }),
    spanProcessors: [createSpanStoreProcessor({ store: spanStore })],
  });

  provider.register();

  // Guarded so the module is import-safe in test environments where appConfig
  // is partially mocked (no backendUrl → nothing to propagate headers to).
  if (appConfig.backendUrl) {
    registerInstrumentations({
      instrumentations: [
        new FetchInstrumentation({
          propagateTraceHeaderCorsUrls: [
            new RegExp(`^${appConfig.backendUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/|$)`),
          ],
        }),
      ],
    });
  }
}

export const tracer = trace.getTracer(`${appConfig.slug}-frontend`);
