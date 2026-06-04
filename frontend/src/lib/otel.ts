/**
 * Frontend OTel setup.
 *
 * Configures a browser TracerProvider with:
 * - SpanStoreProcessor → feeds devtools UI via SpanStore
 * - FetchInstrumentation → auto-injects traceparent on API calls
 *
 * No OTLP exporter (API key can't be in the browser).
 * Backend traces in Maple.dev will show frontend request correlation
 * via the traceparent header.
 */

import { trace } from '@opentelemetry/api';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { appConfig } from 'shared';
import { createSpanStore, createSpanStoreProcessor } from 'shared/tracing';

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: `${appConfig.name}-frontend`,
});

export const spanStore = createSpanStore({ maxSpans: 500 });

const provider = new WebTracerProvider({
  resource,
  spanProcessors: [createSpanStoreProcessor({ store: spanStore })],
});

provider.register();

registerInstrumentations({
  instrumentations: [
    new FetchInstrumentation({
      propagateTraceHeaderCorsUrls: [new RegExp(appConfig.backendUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))],
    }),
  ],
});

export const tracer = trace.getTracer(`${appConfig.name}-frontend`);
