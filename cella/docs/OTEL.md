# Observability

This document explains how [OpenTelemetry](https://opentelemetry.io/docs/) traces, metrics and logs move between the services, and how to instrument a new worker.

### TL;DR

Every Node service uses one setup for [OpenTelemetry](https://opentelemetry.io/) traces, metrics,
and logs. They go to any OTLP endpoint. The browser reports errors and sessions to a DSN. One trace
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
               OTLP sink: any OTLP endpoint

    frontend: errors and sessions to a DSN, a local tracer for the devtools
          └── traceparent and session.id on API calls ──▶ backend
```

Each service names itself `{slug}-<name>`, such as `{slug}-api` or `{slug}-cdc`. The backend image takes its process mode as the name. Every span, metric and log record carries that name, the release it runs and the environment. The release is `RELEASE_SHA`, or a checkout's commit, and the browser bundle reports the same one. Its spans and metrics also carry `service.instance.id`, one id per process, which tells two machines of one service apart.

## Destination

A process exports when `OTEL_EXPORTER_OTLP_ENDPOINT` is set: all three signals go to this OTLP base URL, as JSON over HTTP, gzipped unless `OTEL_EXPORTER_OTLP_COMPRESSION` says otherwise. The destination's key travels in `OTEL_EXPORTER_OTLP_HEADERS`. Without the endpoint, telemetry stays in the process.

```sh
# .env: a local Collector, or any backend that takes OTLP over HTTP
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_EXPORTER_OTLP_HEADERS=authorization=Bearer <key>
```

The other standard `OTEL_*` variables apply too, such as a per-signal endpoint or the trace sampler. Without `OTEL_TRACES_SAMPLER`, a service records every request it serves, also one whose caller flags its trace as not sampled; any other span keeps its remote sender's choice.

A deployed machine receives only the variables its runtime secrets and its service's `env` declare. The endpoint and its headers are the runtime secrets `otlp-endpoint` and `otlp-headers`, which an operator sets ([runtime-secrets.config.ts](../../infra/config/runtime-secrets.config.ts)). Declare any other in the service's `env` in [services.config.ts](../../infra/config/services.config.ts).

The browser has no OTLP export. It sends errors and one session per page load to a DSN, in the Sentry envelope protocol, through Sentry's browser SDK ([monitoring.ts](../../frontend/src/lib/monitoring.ts)). A deployed mode names the DSN in its config as `monitoring.dsn`, and the frontend CSP allows its origin. Development reads `VITE_MONITORING_DSN` from `frontend/.env`. Without a DSN the browser sends nothing.

An error that reaches any React boundary counts as unhandled, and a failure the app caught and continued from as handled. A session names the signed-in user by id alone. No span, web vital, replay or cookie leaves the browser, and the privacy policy says so. A local tracer keeps the spans for the devtools.

## Add a worker

Every worker needs the parts below. CDC is the reference:

- [tracing.ts](../../cdc/src/lib/tracing.ts) starts the shared setup under the worker's service name.
- [pino.ts](../../cdc/src/lib/pino.ts) ships logs to the same destination and prints readable lines in development.
- [index.ts](../../cdc/src/index.ts) starts telemetry, then a graceful shutdown that flushes it on a signal.
- A worker that serves HTTP mounts the shared health app ([health-app.ts](../../shared/src/health-app.ts)).

### Metrics

Use observable gauges for runtime state, and counters or histograms for request-scoped measurements. Name a metric without its unit and pass the unit as `unit`, such as `lens.transform.duration` with `unit: 'ms'`.

A service started on its own reports its runtime, its process and its database pool once a minute, every 5 seconds in development. `OTEL_METRIC_EXPORT_INTERVAL` sets another interval in milliseconds. A worker passes its main pool to `createOtelSDK` as `pool`.

Under `singleVM` the API reports the runtime and the process once, under its own name, and its own pool alone. The workers folded into it report neither, and their pools go unreported.

An observable gauge exports only what its last callback observed: a value no callback reports any more is gone from the next export. A callback that reads elsewhere, such as the database, fits its read in `otel.callbackTimeoutMs`.

An idle event loop reads a delay of about 10 ms: the delay is sampled every 10 ms and includes that interval.

## Add tracing

### Manual spans

Use `@opentelemetry/api` directly in any service with OTel started. CDC's `withSpan()` runs a function in a span.

### Span names and attributes

Span names are constants in [span-names.ts](../../shared/src/tracing/span-names.ts), grouped by service prefix such as `cdc.*`. Never inline strings. The shared tracing module also exports attribute builders. Add one when a group of spans shares attributes. Attribute keys are dotted lower snake case, such as `activity.subject_id`.

## What is emitted

| Family | Service | What it shows |
| --- | --- | --- |
| HTTP server, outbound fetch, Postgres query | Backend | Every request and query, by the OTel conventions |
| `nodejs.eventloop.*`, `v8js.*`, `process.*` | Every service | Event loop delay and use, heap and garbage collection, resident memory against its limit, CPU, uptime |
| `db.client.connection.*` | Every service | Its main pool's connections in use and idle, its maximum, requests waiting |
| `postgresql.*` | Jobs worker | The server's sessions by state against its limit, the oldest transaction, lock waits, the database's size, commits, rollbacks, deadlocks, temporary files, transaction id age, the WAL its replication slots hold |
| `sync.*` | Backend | A change arriving from the CDC worker and its fan-out to streams |
| `lens.*`, `schema.*` | Backend | Schema evolution: transform time, warnings, client versions seen |
| `cdc.*` | CDC | Each WAL message and recorded activity, replication status, the socket to the API |
| `yjs.*` | Yjs | Open connections, documents and clients |
| `sync.message.process`, `client.*` | Frontend, devtools only | A sync message handled, a failure the app caught and continued from, which the browser also reports as a handled error |

A log record carries the trace and span it was written in. The fields of its log line become its attributes. A logged error also becomes `exception.type`, `exception.message` and `exception.stacktrace`, its type named as a span names it. The request log line's body is its method, route, status and duration, never the path.

No service serves a Prometheus scrape target. Metrics leave over OTLP. `/public/metrics` holds only the public counts the website shows.

## Redaction

Tokens travel in request URLs, such as magic-link paths and OAuth callbacks. One function,
`scrubUrl` in [scrub-url.ts](../../shared/src/utils/scrub-url.ts), removes them from spans, logs and the browser's reports alike. The span processor in
[redacting-span-processor.ts](../../shared/src/tracing/redacting-span-processor.ts) runs before every exporter. It also drops the
caller's IP address. A new token route adds its template to `secretPathTemplates` in scrub-url.ts. A new token query key goes in `sensitiveQueryKeys`.

## Trace correlation

A request is one trace. The frontend sends `traceparent` on API calls, and the backend's auto-instrumentation continues it. A database change is a second trace. CDC starts one per change and sends its context as `_trace` with the message. The backend's `sync.activitybus.receive` span continues it.

A request span records the page's session as `session.id`, from the request's `baggage`, and who acted and where, as the guards resolve them: `tenant.id`, `tenant.name`, `tenant.kind`, `organization.id`, `organization.name` and `user.id`. It records an exception only for an answer of 500 or above. A service reads a caller's `baggage` and passes none on.

The two are not joined. The change a request wrote starts a trace of its own, since the WAL carries no trace context. The client's `sync.message.process` span is a third, since a stream frame carries none either.

## Health endpoints

Every HTTP service answers `GET /health` with a shallow 204 for the agent behind the load balancer's check and for liveness probes. `?depth=full` returns JSON diagnostics:

| Service | Full depth adds |
| --- | --- |
| Backend | Database, CDC and jobs components, event-loop lag, memory |
| CDC | Its grade and reasons, replication and slot state, the socket to the API |
| Yjs | Connection, document and client counts |

The diagnostics are a JSON body of the app's own, not the `application/health+json` format of the health-check draft. A component is `healthy`, `degraded` or `unhealthy`. Degraded is slow, not down. It warns and passes a deploy. Unhealthy needs a person and fails a deploy's smoke step. Each worker grades itself and the backend passes the grade on.
