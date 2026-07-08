import { trace } from '@opentelemetry/api';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { appConfig } from 'shared';
import { createSpanStore, createSpanStoreProcessor } from 'shared/tracing';
import { mapleEnabled } from './maple-enabled';

// Devtools span ring. Only fed in development.
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

  // Guarded for test environments where appConfig is partially mocked.
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

/** Active frontend tracer from the provider registered for the current environment. */
export const tracer = trace.getTracer(`${appConfig.slug}-frontend`);
