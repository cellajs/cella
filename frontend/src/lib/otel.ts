import { context, propagation, trace } from '@opentelemetry/api';
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { StackContextManager, TracerProvider } from '@opentelemetry/sdk-trace';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { appConfig } from 'shared';
import { createSpanStore, createSpanStoreProcessor } from 'shared/tracing';
import { escapeRegExp } from 'shared/utils/escape-regexp';
import { monitoringEnabled } from '~/lib/monitoring';

/** Devtools ring of completed frontend tracing spans. */
export const spanStore = createSpanStore({ maxSpans: 500 });

// The local tracer feeds the devtools in every mode and exports nothing. The monitoring SDK, when on, sends the trace
// headers of API requests.
const provider = new TracerProvider({
  resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: `${appConfig.slug}-frontend`, 'deployment.environment.name': appConfig.mode }),
  spanProcessors: [createSpanStoreProcessor({ store: spanStore })],
});

trace.setGlobalTracerProvider(provider);
context.setGlobalContextManager(new StackContextManager().enable());

// Without the monitoring SDK an API request still carries the page's trace for the backend to continue. Guarded for
// test environments where appConfig is partially mocked.
if (!monitoringEnabled && appConfig.backendUrl) {
  propagation.setGlobalPropagator(new CompositePropagator({ propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()] }));
  const backendOrigin = new RegExp(`^${escapeRegExp(appConfig.backendUrl)}(/|$)`);
  registerInstrumentations({ instrumentations: [new FetchInstrumentation({ propagateTraceHeaderCorsUrls: [backendOrigin] })] });
}

/** Active frontend tracer from the provider registered for the current environment. */
export const tracer = trace.getTracer(`${appConfig.slug}-frontend`);
