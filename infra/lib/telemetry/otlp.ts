import { randomBytes } from 'node:crypto';

// Hand-rolled OTLP/JSON builders: the boot runner bundle stays dependency-free and
// the black-box S3 sink stores exactly these objects (no OTel SDK needed).

/** Attribute value types the engine emits. */
export type AttrValue = string | number | boolean;

export interface OtlpKeyValue {
  key: string;
  value: { stringValue: string } | { intValue: string } | { doubleValue: number } | { boolValue: boolean };
}

/** Convert a flat attribute map to OTLP keyValue pairs. */
export function toKeyValues(attrs: Record<string, AttrValue>): OtlpKeyValue[] {
  return Object.entries(attrs).map(([key, value]) => {
    if (typeof value === 'boolean') return { key, value: { boolValue: value } };
    if (typeof value === 'number') {
      return Number.isInteger(value)
        ? { key, value: { intValue: String(value) } }
        : { key, value: { doubleValue: value } };
    }
    return { key, value: { stringValue: value } };
  });
}

export const newTraceId = (): string => randomBytes(16).toString('hex');
export const newSpanId = (): string => randomBytes(8).toString('hex');

/** Unix nanoseconds for an epoch-milliseconds timestamp, as OTLP's string encoding. */
export function unixNano(epochMs: number): string {
  return (BigInt(Math.round(epochMs)) * 1_000_000n).toString();
}

export interface SpanContext {
  traceId: string;
  spanId: string;
}

/** Parse a W3C traceparent header; undefined for anything malformed. */
export function parseTraceparent(header: string | undefined): SpanContext | undefined {
  const match = header?.trim().match(/^[0-9a-f]{2}-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/);
  if (!match) return undefined;
  return { traceId: match[1] ?? '', spanId: match[2] ?? '' };
}

/** Format a W3C traceparent header (sampled flag set: this stream is never sampled away). */
export function formatTraceparent(ctx: SpanContext): string {
  return `00-${ctx.traceId}-${ctx.spanId}-01`;
}

export type SpanStatus = 'ok' | 'error';

export interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpKeyValue[];
  status: { code: number; message?: string };
}

export function buildSpan(opts: {
  ctx: SpanContext;
  parentSpanId?: string;
  name: string;
  startMs: number;
  endMs: number;
  attrs?: Record<string, AttrValue>;
  status?: SpanStatus;
  statusMessage?: string;
}): OtlpSpan {
  return {
    traceId: opts.ctx.traceId,
    spanId: opts.ctx.spanId,
    ...(opts.parentSpanId ? { parentSpanId: opts.parentSpanId } : {}),
    name: opts.name,
    // SPAN_KIND_INTERNAL
    kind: 1,
    startTimeUnixNano: unixNano(opts.startMs),
    endTimeUnixNano: unixNano(opts.endMs),
    attributes: toKeyValues(opts.attrs ?? {}),
    status:
      opts.status === 'error'
        ? { code: 2, ...(opts.statusMessage ? { message: opts.statusMessage } : {}) }
        : { code: 1 },
  };
}

export type Severity = 'info' | 'warn' | 'error';

const severityNumbers: Record<Severity, number> = { info: 9, warn: 13, error: 17 };

export interface OtlpLogRecord {
  timeUnixNano: string;
  observedTimeUnixNano: string;
  severityNumber: number;
  severityText: string;
  eventName: string;
  body: { stringValue: string };
  attributes: OtlpKeyValue[];
  traceId?: string;
  spanId?: string;
}

/** A named event as an OTLP log record (the post-span-events model: events are logs). */
export function buildEvent(opts: {
  name: string;
  timeMs: number;
  attrs?: Record<string, AttrValue>;
  severity?: Severity;
  body?: string;
  ctx?: SpanContext;
}): OtlpLogRecord {
  const severity: Severity = opts.severity ?? 'info';
  const time = unixNano(opts.timeMs);
  // Backends render the BODY as the message line, so it must read on its own:
  // the event name plus logfmt attrs. Attributes stay structured for rules.
  const attrs = opts.attrs ?? {};
  const logfmt = Object.entries(attrs)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  return {
    timeUnixNano: time,
    observedTimeUnixNano: time,
    severityNumber: severityNumbers[severity],
    severityText: severity,
    eventName: opts.name,
    body: { stringValue: opts.body ?? (logfmt ? `${opts.name} ${logfmt}` : opts.name) },
    // event.name doubles as an attribute for backends predating the field.
    attributes: toKeyValues({ 'event.name': opts.name, ...attrs }),
    ...(opts.ctx ? { traceId: opts.ctx.traceId, spanId: opts.ctx.spanId } : {}),
  };
}

// OTLP instrumentation scope: names the emitting component (this deploy engine),
// not the deployed app. App identity travels in the `resource` attributes.
const SCOPE_NAME = 'infra';

/** OTLP/JSON envelope for a logs export request. */
export function logsPayload(resource: Record<string, AttrValue>, records: OtlpLogRecord[]): unknown {
  return {
    resourceLogs: [
      {
        resource: { attributes: toKeyValues(resource) },
        scopeLogs: [{ scope: { name: SCOPE_NAME }, logRecords: records }],
      },
    ],
  };
}

/** OTLP/JSON envelope for a traces export request. */
export function tracesPayload(resource: Record<string, AttrValue>, spans: OtlpSpan[]): unknown {
  return {
    resourceSpans: [
      {
        resource: { attributes: toKeyValues(resource) },
        scopeSpans: [{ scope: { name: SCOPE_NAME }, spans }],
      },
    ],
  };
}
