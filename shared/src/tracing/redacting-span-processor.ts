import type { Attributes, AttributeValue } from '@opentelemetry/api';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { isFailedQueryMessage, redactedFailedQuery, redactFailedQuery } from '../utils/failed-query.ts';
import { scrubUrl } from '../utils/scrub-url.ts';

const isStringArray = (value: AttributeValue): value is (string | null | undefined)[] =>
  Array.isArray(value) && value.some((item: unknown) => typeof item === 'string');

/** One span string without URL secrets or failed-query values. */
const scrubText = (text: string): string => scrubUrl(redactFailedQuery(text));

/** An error message: a failed query's whole message goes, since its values may span any number of lines. */
const scrubMessage = (message: string): string =>
  isFailedQueryMessage(message) ? redactedFailedQuery : scrubText(message);

/** Scrubs every string and string-array value in place. */
function scrubAttributes(attributes: Attributes): void {
  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value === 'string') attributes[key] = scrubText(value);
    else if (value !== undefined && isStringArray(value)) {
      attributes[key] = value.map((item) => (typeof item === 'string' ? scrubText(item) : item));
    }
  }
}

/** An exception event (`recordException`): its message, and that exact message where the stack repeats it. */
function scrubException(attributes: Attributes): void {
  const message = attributes['exception.message'];
  if (typeof message !== 'string') return;
  const scrubbed = scrubMessage(message);
  attributes['exception.message'] = scrubbed;
  const stack = attributes['exception.stacktrace'];
  if (typeof stack === 'string' && message) attributes['exception.stacktrace'] = stack.split(message).join(scrubbed);
}

/**
 * Removes secrets from a span as it ends, with the same `scrubUrl` the loggers use: the name, every string attribute
 * (`url.full`, `url.query`, `url.path` and the rest), event attributes such as an exception's message and stack, and
 * the status message. A failed query quoted anywhere loses its SQL and values (`redactFailedQuery`). `createOtelSDK`
 * registers it before every other processor, so the exporter and any debug processor only ever read the scrubbed span.
 * It mutates the ended span in place: `onEnd` is the one hook every processor runs in order, and the span is no longer
 * writable through its API by then.
 */
export function createRedactingSpanProcessor(): SpanProcessor {
  return {
    onStart(): void {},
    onEnd(span: ReadableSpan): void {
      const name = scrubUrl(span.name);
      if (name !== span.name) Object.assign(span, { name });
      scrubAttributes(span.attributes);
      for (const event of span.events) {
        if (!event.attributes) continue;
        scrubException(event.attributes);
        scrubAttributes(event.attributes);
      }
      if (span.status.message) span.status.message = scrubMessage(span.status.message);
    },
    async forceFlush(): Promise<void> {},
    async shutdown(): Promise<void> {},
  };
}
