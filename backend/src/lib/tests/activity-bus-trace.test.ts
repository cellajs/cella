import { context, propagation, trace } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { createOtelSDK } from 'shared/otel';
import { collectingExporter } from 'shared/testing/telemetry';
import { backendSpanNames } from 'shared/tracing';
import { afterAll, describe, expect, it } from 'vitest';
import { type ActivityEvent, activityBus } from '#/lib/activity-bus';

/** An attachment change as the CDC socket hands it to the bus; only `trace` matters here. */
const eventWith = (eventTrace: ActivityEvent['trace']) =>
  // A test mock: the bus reads the type, the ids and the trace, never the rest of the activity row.
  ({ type: 'attachment.created', entityType: 'attachment', subjectId: 'attachment-1', trace: eventTrace }) as unknown as ActivityEvent;

describe('activity bus receive span', () => {
  afterAll(() => {
    trace.disable();
    context.disable();
    propagation.disable();
  });

  it("joins the trace of the CDC span that sent the message, as that span's child", async () => {
    const exported: ReadableSpan[] = [];
    const otel = createOtelSDK({ serviceName: 'test-api', traceExporter: collectingExporter(exported), autoInstrumentations: false });
    otel.start();
    const sender = { traceId: '0af7651916cd43dd8448eb211c80319c', spanId: 'b7ad6b7169203331', traceFlags: 1, cdcTimestamp: Date.now() };

    activityBus.emit(eventWith(sender));
    activityBus.emit(eventWith(null));
    await otel.shutdown();

    const [joined, alone] = exported.filter((span) => span.name === backendSpanNames.activityBusReceive);
    expect(joined?.spanContext().traceId).toBe(sender.traceId);
    expect(joined?.parentSpanContext?.spanId).toBe(sender.spanId);
    // Positive control: a message without a context starts a trace of its own.
    expect(alone?.spanContext().traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(alone?.spanContext().traceId).not.toBe(sender.traceId);
    expect(alone?.parentSpanContext).toBeUndefined();
  });
});
