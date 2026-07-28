import type { FetchLike } from '../utils/fetch-like'
import { resolveFetch } from '../utils/fetch-like'
import { type EventDef, type Placeholders, renderEvent } from './events'
import {
  type AttrValue,
  buildEvent,
  buildSpan,
  formatTraceparent,
  logsPayload,
  newSpanId,
  newTraceId,
  type OtlpLogRecord,
  type OtlpSpan,
  parseTraceparent,
  type Severity,
  type SpanContext,
  type SpanStatus,
  tracesPayload,
} from './otlp'

export interface TelemetryOptions {
  /** Resource attributes stamped on every span and event. */
  resource: Record<string, AttrValue>
  /** OTLP/HTTP base ending in /v1 (e.g. https://ingest.maple.dev/v1). Absent = build-only (black box still works). */
  endpoint?: string
  headers?: Record<string, string>
  /** Parent context (a W3C traceparent) this emitter's root joins, e.g. the deploy trace from the boot plan. */
  traceparent?: string
  fetchImpl?: FetchLike
  /** Telemetry must never fail the operation it observes; failures land here. */
  onError?: (message: string) => void
  now?: () => number
}

export interface SpanHandle {
  ctx: SpanContext
  traceparent(): string
  end(status?: SpanStatus, opts?: { attrs?: Record<string, AttrValue>; message?: string }): void
}

export interface Telemetry {
  /** Root context of this emitter (every span/event correlates to it). */
  rootCtx: SpanContext
  traceparent(): string
  startSpan(name: string, attrs?: Record<string, AttrValue>, parent?: SpanContext): SpanHandle
  /** Emit a cataloged event: the template's placeholders are required attrs and render the body. */
  event<T extends string>(
    def: EventDef<T>,
    attrs: Record<Placeholders<T>, AttrValue> & Record<string, AttrValue>,
    opts?: { severity?: Severity; body?: string; ctx?: SpanContext },
  ): void
  event(name: string, attrs?: Record<string, AttrValue>, opts?: { severity?: Severity; body?: string; ctx?: SpanContext }): void
  /** Every buffered log record, JSONL-encoded: the black-box sink's exact payload. */
  eventsJsonl(): string
  /** Attach/replace the OTLP export target after creation (the boot runner only
   *  learns its ingest key after secret hydration; earlier records still export). */
  configureExport(config: { endpoint: string; headers?: Record<string, string> }): void
  /** Export buffered spans + events over OTLP/HTTP. Swallows failures; safe to call repeatedly. */
  flush(): Promise<void>
}

/**
 * A tiny buffered OTel emitter over the OTLP/JSON builders. One instance per
 * process (a deploy run, a VM boot); volume is dozens of records, so flushing
 * whole buffers at the end of phases is enough.
 */
export function createTelemetry(opts: TelemetryOptions): Telemetry {
  const now = opts.now ?? Date.now
  const fetchImpl = resolveFetch(opts.fetchImpl)
  const onError = opts.onError ?? (() => {})
  const parent = parseTraceparent(opts.traceparent)
  const rootCtx: SpanContext = { traceId: parent?.traceId ?? newTraceId(), spanId: parent?.spanId ?? newSpanId() }
  let exporter: { endpoint: string; headers?: Record<string, string> } | undefined =
    opts.endpoint ? { endpoint: opts.endpoint, headers: opts.headers } : undefined

  const spans: OtlpSpan[] = []
  const records: OtlpLogRecord[] = []
  const exported = { spans: 0, records: 0 }

  const startSpan = (name: string, attrs: Record<string, AttrValue> = {}, parentCtx: SpanContext = rootCtx): SpanHandle => {
    const ctx: SpanContext = { traceId: parentCtx.traceId, spanId: newSpanId() }
    const startMs = now()
    let ended = false
    return {
      ctx,
      traceparent: () => formatTraceparent(ctx),
      end(status: SpanStatus = 'ok', endOpts = {}) {
        if (ended) return
        ended = true
        spans.push(
          buildSpan({
            ctx,
            parentSpanId: parentCtx.spanId,
            name,
            startMs,
            endMs: now(),
            attrs: { ...attrs, ...(endOpts.attrs ?? {}) },
            status,
            statusMessage: endOpts.message,
          }),
        )
      },
    }
  }

  const post = async (path: string, payload: unknown): Promise<void> => {
    if (!exporter) return
    const res = await fetchImpl(`${exporter.endpoint}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(exporter.headers ?? {}) },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }

  return {
    rootCtx,
    traceparent: () => formatTraceparent(rootCtx),
    startSpan,
    event(nameOrDef: EventDef | string, attrs: Record<string, AttrValue> = {}, eventOpts: { severity?: Severity; body?: string; ctx?: SpanContext } = {}) {
      const def = typeof nameOrDef === 'string' ? undefined : nameOrDef
      records.push(
        buildEvent({
          name: def?.name ?? (nameOrDef as string),
          timeMs: now(),
          attrs,
          severity: eventOpts.severity,
          body: eventOpts.body ?? (def ? renderEvent(def, attrs) : undefined),
          ctx: eventOpts.ctx ?? rootCtx,
        }),
      )
    },
    eventsJsonl() {
      return records.map((record) => JSON.stringify(record)).join('\n')
    },
    configureExport(config) {
      exporter = config
    },
    async flush() {
      if (!exporter) return
      const newSpans = spans.slice(exported.spans)
      const newRecords = records.slice(exported.records)
      try {
        if (newSpans.length > 0) await post('/traces', tracesPayload(opts.resource, newSpans))
        exported.spans = spans.length
        if (newRecords.length > 0) await post('/logs', logsPayload(opts.resource, newRecords))
        exported.records = records.length
      } catch (err) {
        onError(`telemetry export failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    },
  }
}

/** OTLP endpoint + headers from the environment: explicit OTLP vars win, a maple ingest key implies the maple endpoint. */
export function otlpConfigFromEnv(env: NodeJS.ProcessEnv = process.env): { endpoint: string; headers: Record<string, string> } | undefined {
  const explicit = env.OTEL_EXPORTER_OTLP_ENDPOINT
  if (explicit) {
    const headers: Record<string, string> = {}
    for (const pair of (env.OTEL_EXPORTER_OTLP_HEADERS ?? '').split(',')) {
      const eq = pair.indexOf('=')
      if (eq > 0) headers[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim()
    }
    return { endpoint: explicit.replace(/\/$/, ''), headers }
  }
  const mapleKey = env.MAPLE_SECRET_INGEST_KEY
  if (mapleKey) return { endpoint: 'https://ingest.maple.dev/v1', headers: { 'x-maple-ingest-key': mapleKey } }
  return undefined
}
