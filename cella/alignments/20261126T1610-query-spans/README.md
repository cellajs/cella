---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: PgInstrumentation, requireParentSpan, lib/tracing
---

# Postgres queries trace inside a span, and every backend entry loads tracing first

`main.api.ts`, `jobs-worker.ts` and the mcp and oauth worker entries start with the bare import
`import '#/lib/tracing';`, and `PgInstrumentation` in `shared/src/otel.ts` takes `requireParentSpan: true`. A request's
queries now reach the destination as child spans, and a query outside any span makes none. An app's own entry of the
backend image that starts `otel` adds the same first line.

## What & why

The pg instrumentation patches only a `pg` loaded after it is constructed. The API and the jobs worker loaded `pg`
(through `#/core/openapi-registration` and `#/lib/health`) before `#/lib/tracing` and emitted no query span. The mcp and oauth workers, which import it earlier,
traced every query, one outside a request as a root span. Biome sorts a named import back behind `#/db/db`: the first
line is a bare import.

## Blast radius

Every app that exports traces: a request carries about two more spans per query (the pool's connect and the query)
and, in a transaction, one per statement. Under `singleVM` the folded CDC worker's flushes become children of its
`cdc.*` spans. No database, cache or lens change.

## Run

No script: manual.

## Manual steps

1. Not caught by anything. Each entry of the app's own that calls `otel.start()` from `#/lib/tracing` (a worker run as a `SERVICE` of the backend image) gets `import '#/lib/tracing';` as its first line, before any import that reaches `#/db/db`, `#/lib/health` or `#/modules`.
2. Not caught by anything. App code that read root `pg` spans, such as queries a background loop runs outside any span, finds none: it wraps that work in a span of its own when it wants its queries traced.
3. Check what the destination takes. With every request recorded, the span volume grows several times: set `OTEL_TRACES_SAMPLER` to a ratio sampler, or raise the receiver's limits. The batch span processor's queue of 2048 drops what it cannot export.
4. Each query span carries the statement's text (`db.query.text`) without its bound values: an app whose privacy text lists what its monitoring receives names it.

## Verify

```sh
pnpm check
```

By hand: with `OTEL_EXPORTER_OTLP_ENDPOINT` set to a local Collector, one request to the API shows `pg-pool.connect`
and `pg.query:*` spans under its server span, and an idle jobs worker sends no `pg` span.
