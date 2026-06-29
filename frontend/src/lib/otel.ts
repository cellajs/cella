/**
 * Frontend OTel setup.
 *
 * Configures a browser TracerProvider with:
 * - SpanStoreProcessor → feeds devtools UI via SpanStore
 * - FetchInstrumentation → auto-injects traceparent on API calls
 * - OTLP exporter → ships spans to Maple.dev, but only when a *public* ingest
 *   key (`appConfig.maplePublicIngestKey`) is set. The server-side secret ingest
 *   key is never bundled in the browser. Without a public key, spans stay local
 *   (devtools only) and Maple still correlates frontend requests via the
 *   traceparent header injected by FetchInstrumentation.
 */

import { trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, type SpanProcessor, WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { appConfig } from 'shared';
import { createSpanStore, createSpanStoreProcessor } from 'shared/tracing';

// Maple.dev OTLP traces ingest endpoint (kept in sync with the backend MAPLE_INGEST_BASE in shared/src/otel.ts).
const MAPLE_TRACES_INGEST_URL = 'https://ingest.maple.dev/v1/traces';

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: `${appConfig.slug}-frontend`,
  // OTel semantic convention: deploy environment (development/staging/production/…).
  'deployment.environment.name': appConfig.mode,
});

export const spanStore = createSpanStore({ maxSpans: 500 });

const spanProcessors: SpanProcessor[] = [createSpanStoreProcessor({ store: spanStore })];

// Export to Maple only when a browser-safe public ingest key is configured.
if (appConfig.maplePublicIngestKey) {
  spanProcessors.push(
    new BatchSpanProcessor(
      new OTLPTraceExporter({
        url: MAPLE_TRACES_INGEST_URL,
        headers: { 'x-maple-ingest-key': appConfig.maplePublicIngestKey },
      }),
    ),
  );
}

const provider = new WebTracerProvider({
  resource,
  spanProcessors,
});

provider.register();

registerInstrumentations({
  instrumentations: [
    new FetchInstrumentation({
      propagateTraceHeaderCorsUrls: [
        new RegExp(`^${appConfig.backendUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/|$)`),
      ],
    }),
  ],
});

export const tracer = trace.getTracer(`${appConfig.slug}-frontend`);
