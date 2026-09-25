import type { Attributes, AttributeValue } from '@opentelemetry/api';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { scrubUrl } from '../utils/scrub-url.ts';

const isStringArray = (value: AttributeValue): value is (string | null | undefined)[] =>
  Array.isArray(value) && value.some((item: unknown) => typeof item === 'string');

/** Scrubs every string and string-array value in place. */
function scrubAttributes(attributes: Attributes): void {
  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value === 'string') attributes[key] = scrubUrl(value);
    else if (value !== undefined && isStringArray(value)) {
      attributes[key] = value.map((item) => (typeof item === 'string' ? scrubUrl(item) : item));
    }
  }
}

/**
 * Removes secrets from a span as it ends, with the same `scrubUrl` the loggers use: the name, every string attribute
 * (`url.full`, `url.query`, `url.path` and the rest), event attributes such as an exception message, and the status
 * message. `createOtelSDK` registers it before every other processor, so the exporter and any debug processor only
 * ever read the scrubbed span. It mutates the ended span in place: `onEnd` is the one hook every processor runs in
 * order, and the span is no longer writable through its API by then.
 */
export function createRedactingSpanProcessor(): SpanProcessor {
  return {
    onStart(): void {},
    onEnd(span: ReadableSpan): void {
      const name = scrubUrl(span.name);
      if (name !== span.name) Object.assign(span, { name });
      scrubAttributes(span.attributes);
      for (const event of span.events) if (event.attributes) scrubAttributes(event.attributes);
      if (span.status.message) span.status.message = scrubUrl(span.status.message);
    },
    async forceFlush(): Promise<void> {},
    async shutdown(): Promise<void> {},
  };
}
