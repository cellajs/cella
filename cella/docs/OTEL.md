# Observability

This document explains where the services send [OpenTelemetry](https://opentelemetry.io/docs/) traces, metrics and logs, how to instrument a service, and what the health endpoints answer.

### TL;DR

Every Node service shares one OpenTelemetry setup and sends traces, metrics and logs to any OTLP endpoint. The browser reports errors and sessions to a DSN. One trace follows a request from a browser click through the API. A second follows a database change from CDC into the API.

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

Every span, metric and log record says where it came from:

- **Service:** `{slug}-<name>`, such as `{slug}-api` or `{slug}-cdc`. A process of the backend image takes its `SERVICE` as the name.
- **Release:** `RELEASE_SHA`, or a checkout's commit. The browser bundle reports the same one.
- **Environment:** the mode it runs in.

Spans and metrics also carry `service.instance.id`, one id per process, which tells two machines of one service apart.

## Destination

A process exports when you set `OTEL_EXPORTER_OTLP_ENDPOINT`: traces, metrics and logs go to this OTLP base URL, as JSON over HTTP, gzipped unless `OTEL_EXPORTER_OTLP_COMPRESSION` says otherwise. The destination's key travels in `OTEL_EXPORTER_OTLP_HEADERS`. Without the endpoint, telemetry stays in the process. No service serves a Prometheus scrape target: `/public/metrics` holds only the public counts the website shows.

```sh
# .env: a local Collector, or any backend that takes OTLP over HTTP
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_EXPORTER_OTLP_HEADERS=authorization=Bearer <key>
```

The other standard `OTEL_*` variables apply too, such as an endpoint for traces alone or the trace sampler. Without `OTEL_TRACES_SAMPLER`, a service records every request it serves, also one whose caller flags its trace as not sampled; any other span keeps its remote sender's choice.

On a deployed machine, you set the endpoint and its headers as runtime secrets, and any other variable in the service's `env` in [description.yml](../infra/description.yml).

### Browser reports

The browser sends errors and one session per page load to a DSN, in the Sentry envelope protocol, through Sentry's browser SDK ([monitoring.ts](../../frontend/src/lib/monitoring.ts)). It has no OTLP export, and without a DSN it sends nothing.

You name the DSN per mode as `monitoring.dsn` in its config, and a deployed mode's CSP allows its origin. In development and tunnel `VITE_MONITORING_DSN` in `frontend/.env` wins.

An error that reaches any React boundary counts as unhandled, and a failure the app caught and continued from as handled. A session names the signed-in user by id alone. No span, web vital, replay or cookie leaves the browser, and the privacy policy says so.

## Add a service

Give a new service the parts below. CDC is the reference:

- [tracing.ts](../../cdc/src/lib/tracing.ts) starts the shared setup under the service's name.
- [pino.ts](../../cdc/src/lib/pino.ts) ships logs to the same destination.
- [index.ts](../../cdc/src/index.ts) starts telemetry, then a graceful shutdown that flushes it when the process is told to stop.
- A service that serves HTTP mounts the shared health app ([health-app.ts](../../shared/src/health-app.ts)).
- A service that runs as a `SERVICE` of the backend image starts the backend's SDK from [tracing.ts](../../backend/src/lib/tracing.ts) and imports it on its entry's first line, as a bare import. A `pg` loaded before it makes no query span.

### Metrics

Use observable gauges for runtime state, and counters or histograms for request-scoped measurements. A gauge callback that reads elsewhere, such as the database, must fit its read in `otel.callbackTimeoutMs`. Name a metric without its unit and pass the unit as `unit`, such as `lens.transform.duration` with `unit: 'ms'`.

A service started on its own reports its runtime, its process and its database pool once a minute. `OTEL_METRIC_EXPORT_INTERVAL` sets another interval in milliseconds. Pass a service's main pool to `createOtelSDK` as `pool`.

## Add tracing

### Manual spans

Use `@opentelemetry/api` directly in any service with OTel started. CDC's `withSpan()` runs a function in a span.

### Span names and attributes

Three rules keep names alike across services:

- A span name is a constant in [span-names.ts](../../shared/src/tracing/span-names.ts), under its service prefix such as `cdc.*`, never an inline string.
- When a group of spans shares attributes, add an attribute builder to the shared tracing module.
- Attribute keys are dotted lower snake case, such as `activity.subject_id`.

## What is emitted

| Family | Emitted by | What it shows |
| --- | --- | --- |
| HTTP server, outbound fetch, Postgres query | Backend | Every request, and every query that runs inside a span such as a request's, by the OTel conventions: a request's method, route, path and query, status and the caller's user agent, and a query's text without its values |
| `nodejs.eventloop.*`, `v8js.*`, `process.*` | Every service | Event loop delay and use, heap and garbage collection, resident memory against its limit, CPU, uptime |
| `db.client.connection.*` | Every service | Its main pool's connections in use and idle, its maximum, requests waiting |
| `postgresql.*` | Jobs service | Sessions against the server's limit, lock waits, the WAL its replication slots hold, and more |
| `sync.*` | Backend | A change arriving from CDC and its fan-out to streams |
| `lens.*`, `schema.*` | Backend | Schema evolution: transform time, warnings, client versions seen |
| `cdc.*` | CDC | Each WAL message and recorded activity, replication status, the socket to the API |
| `yjs.*` | Yjs | Open connections, documents and clients |
| `sync.message.process`, `client.*` | Frontend, devtools only | A sync message handled, a failure the app caught and continued from, which the browser also reports as a handled error |

A log record carries the trace and span it was written in. Three rules map a log line onto it:

- The line's fields become the record's attributes.
- A logged error also becomes `exception.type`, `exception.message` and `exception.stacktrace`.
- The request line's body is its method, route, status and duration, never the path. The path and query, without secrets, are an attribute beside the user id and the sign-in session's id.

## Redaction

Redaction keeps tokens out of telemetry. They travel in request URLs, such as magic-link paths and OAuth callbacks. One function, `scrubUrl` in [scrub-url.ts](../../shared/src/utils/scrub-url.ts), removes them from spans, logs and the browser's reports alike. The span processor in [redacting-span-processor.ts](../../shared/src/tracing/redacting-span-processor.ts) runs before every exporter and also drops the caller's IP address.

When you add a token route, add its template to `secretPathTemplates` in scrub-url.ts, and a new token query key to `sensitiveQueryKeys`.

## Trace correlation

An edit leaves three traces on its way from one tab to another, and they are not joined:

- **Request:** the frontend sends `traceparent` on API calls, and the backend's auto-instrumentation continues it.
- **Change:** CDC starts one per change and sends its context as `_trace` with the message. The backend's `sync.activitybus.receive` span continues it.
- **Stream frame:** the client's `sync.message.process` span starts its own, since a stream frame carries no trace context.

A request span records the page's session as `session.id`, from the request's `baggage`, and who acted and where, as the guards resolve them:

- `user.id`
- `tenant.id`, `tenant.name`, `tenant.kind`
- `organization.id`, `organization.name`

It records an exception only for an answer of 500 or above. A service reads a caller's `baggage` and passes none on.

## Health endpoints

Every HTTP service answers `GET /health` with a shallow 204 for the agent behind the load balancer's check and for liveness probes. `?depth=full` returns JSON diagnostics:

| Service | Full depth adds |
| --- | --- |
| Backend | Database, CDC and jobs components, event-loop lag, memory |
| CDC | Its grade and reasons, replication and slot state, the socket to the API |
| Yjs | Connection, document and client counts |

The diagnostics are a JSON body of the app's own, not the `application/health+json` format of the health-check draft. A component is `healthy`, `degraded` or `unhealthy`. Degraded is slow, not down: it warns and passes a deploy. Unhealthy needs a person and fails a deploy's smoke step.
