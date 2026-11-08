# Observability

This document explains how traces, metrics, and logs move between Cella's services, and how to
instrument a new worker. It assumes you know OpenTelemetry: traces and spans, metrics and the OTLP export ([opentelemetry.io](https://opentelemetry.io/docs/)).

### TL;DR

Every service uses the same setup for [OpenTelemetry](https://opentelemetry.io/) traces, metrics,
and logs. They go to [Maple.dev](https://maple.dev) by default, or to any OTLP endpoint. One trace
follows a request from a browser click through the backend. A second follows a database change from
the database-change worker into the backend.

## Architecture

```
            shared/src/otel.ts: one setup for every Node service
          ┌──────────────────────┼──────────────────────┐
          ▼                      ▼                      ▼
    backend image               cdc                    yjs
    HTTP + database spans,      a trace per change,    connection gauges
    sync and schema metrics     replication gauges
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 ▼
               OTLP sink: Maple.dev or any OTLP endpoint

    frontend: Maple's browser SDK, a local tracer in development
          └── traceparent on API calls ──▶ backend
```

Each service names itself `{slug}-<name>`, such as `{slug}-api` or `{slug}-cdc`. The backend image takes its process mode as the name. Every span, metric and log record carries that name, the release it runs and the environment.

## Destination

A process exports when one of two variables is set. With neither, telemetry stays in the process.

| Variable | Effect |
| --- | --- |
| `MAPLE_SECRET_INGEST_KEY` | All three signals go to Maple.dev. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | All three signals go to this OTLP base URL, as JSON over HTTP. The Maple key is then ignored. |

```sh
# .env: a local Collector, or any backend that takes OTLP over HTTP
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_EXPORTER_OTLP_HEADERS=authorization=Bearer <key>
```

The other standard `OTEL_*` variables apply too, such as a per-signal endpoint or the trace sampler. A deployed machine receives only the variables its runtime secrets and its service's `env` declare. Declare a secret one beside the
Maple key in [runtime-secrets.config.ts](../infra/config/runtime-secrets.config.ts). Declare any other in the service's `env` in [services.config.ts](../infra/config/services.config.ts).

The browser reports to Maple through Maple's own SDK and has no OTLP export. It sends errors, traces and web vitals ([maple.ts](../frontend/src/lib/maple.ts)). It sends no
session replay, cookies or user id. The privacy policy relies on that. In development a local tracer keeps the spans for the devtools.

## Add a worker

Every worker needs the parts below. CDC is the reference:

- [tracing.ts](../cdc/src/lib/tracing.ts) starts the shared setup under the worker's service name.
- [pino.ts](../cdc/src/lib/pino.ts) ships logs to the same destination and prints readable lines in development.
- [index.ts](../cdc/src/index.ts) starts telemetry, then a graceful shutdown that flushes it on a signal or a crash.
- A worker that serves HTTP mounts the shared health app ([health-app.ts](../shared/src/health-app.ts)).

### Metrics

Use observable gauges for runtime state, and counters or histograms for request-scoped measurements. Name a metric without its unit and pass the unit as `unit`, such as `lens.transform.duration` with `unit: 'ms'`.

## Add tracing

### Manual spans

Use `@opentelemetry/api` directly in any service with OTel started. CDC's `withSpan()` runs a function in a span.

### Span names and attributes

Span names are constants in [span-names.ts](../shared/src/tracing/span-names.ts), grouped by service prefix such as `cdc.*`. Never inline strings. The shared tracing module also exports attribute builders. Add one when a group of spans shares attributes. Attribute keys are dotted lower snake case, such as `activity.subject_id`.

## What is emitted

| Family | Service | What it shows |
| --- | --- | --- |
| HTTP server, outbound fetch, Postgres query | Backend | Every request and query, by the OTel conventions |
| `sync.*` | Backend | A change arriving from the CDC worker and its fan-out to streams |
| `lens.*`, `schema.*` | Backend | Schema evolution: transform time, warnings, client versions seen |
| `cdc.*` | CDC | Each WAL message and recorded activity, replication status, the socket to the API |
| `yjs.*` | Yjs | Open connections, documents and clients |
| `sync.message.process`, `client.*` | Frontend | A sync message handled, a failure the app caught and continued from |

A log record carries the fields of its log line as attributes, and the trace and span it was written in.

No service serves a Prometheus scrape target. Metrics leave over OTLP. `/metrics/public` holds only the public counts the website shows.

## Redaction

Tokens travel in request URLs, such as magic-link paths and OAuth callbacks. One function,
`scrubUrl` in [scrub-url.ts](../shared/src/utils/scrub-url.ts), removes them from spans and logs alike. The span processor in
[redacting-span-processor.ts](../shared/src/tracing/redacting-span-processor.ts) runs before every exporter. It also drops the
caller's IP address. A new token route adds its template to `secretPathTemplates` in scrub-url.ts. A new token query key goes in `sensitiveQueryKeys`.

## Trace correlation

A request is one trace. The frontend sends `traceparent` on API calls, and the backend's auto-instrumentation continues it. A database change is a second trace. CDC starts one per change and sends its context as `_trace` with the message. The backend's `sync.activitybus.receive` span continues it.

The two are not joined. The WAL carries no trace context, so the change a request wrote starts a trace of its own. A stream frame carries none either, so the client's `sync.message.process` span is a third.

## Health endpoints

Every HTTP service answers `GET /health` with a shallow 204 for the agent behind the load balancer's check and for liveness probes. `?depth=full` returns JSON diagnostics:

| Service | Full depth adds |
| --- | --- |
| Backend | Database, CDC and jobs components, event-loop lag, memory |
| CDC | Its grade and reasons, replication and slot state, the socket to the API |
| Yjs | Connection, document and client counts |

The diagnostics are a JSON body of the app's own, not the `application/health+json` format of the health-check draft. A component is `healthy`, `degraded` or `unhealthy`. Degraded is slow, not down. It warns and passes a deploy. Unhealthy needs a person and fails a deploy's smoke step. Each worker grades itself and the backend passes the grade on.
