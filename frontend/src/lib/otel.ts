import { trace } from '@opentelemetry/api';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { appConfig } from 'shared';
import { createSpanStore, createSpanStoreProcessor } from 'shared/tracing';
import { mapleEnabled } from './maple-enabled';

/** Devtools ring of completed frontend tracing spans. Only fed when Maple tracing is disabled. */
export const spanStore = createSpanStore({ maxSpans: 500 });

if (!mapleEnabled) {
  const provider = new WebTracerProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: `${appConfig.slug}-frontend`, 'deployment.environment.name': appConfig.mode }),
    spanProcessors: [createSpanStoreProcessor({ store: spanStore })],
  });

  provider.register();

  // Guarded for test environments where appConfig is partially mocked.
  if (appConfig.backendUrl) {
    const backendOrigin = new RegExp(`^${appConfig.backendUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/|$)`);
    registerInstrumentations({
      instrumentations: [new FetchInstrumentation({ propagateTraceHeaderCorsUrls: [backendOrigin] })],
    });
  }
}

/** Active frontend tracer from the provider registered for the current environment. */
export const tracer = trace.getTracer(`${appConfig.slug}-frontend`);
