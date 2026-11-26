---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: maplePublicIngestKey, mapleEnabled, isMapleOptedIn, VITE_MAPLE, lib/maple, @maple-dev/browser, ingest.maple.dev
---

# The browser reports to a DSN through Sentry's browser SDK, and `maplePublicIngestKey` becomes `monitoring.dsn`

Replace `maplePublicIngestKey` with `monitoring: { dsn: '' }` in `shared/config/config.default.ts`, and name a deployed
mode's DSN in that mode's config file. Import `reportReactError`, `reportRejectedResponse` and `monitoringEnabled` from
`~/lib/monitoring`, in place of `~/lib/maple` and `mapleEnabled` of `~/lib/otel`. Drop `VITE_MAPLE` from `frontend/.env`
and rewrite privacy texts that name Maple. Apply every deployed environment before its next deploy.

## What & why

`frontend/src/lib/maple.ts` and `@maple-dev/browser` are gone. `monitoring.ts` sends errors and one session per page
load through `@sentry/browser`, in the Sentry envelope protocol that any compatible receiver takes, to
`appConfig.monitoring.dsn`; development and tunnel read `VITE_MONITORING_DSN` from `frontend/.env`. The frontend CSP
names the DSN's origin in place of `ingest.maple.dev`. `@sentry/vite-plugin` puts a debug id in every production bundle
and map. No vendor key remains in config, env or the CSP.

## Blast radius

Every app. The typecheck flags the config key, the imports and the flag. An app deployed against Maple reports
nothing from the browser until it names a DSN, and nothing fails. Every deployed environment owes an apply: its CSP
changes. No database, cache or lens change.

## Run

No script: manual.

## Manual steps

1. Caught by the compiler. `shared/config/config.default.ts`: `maplePublicIngestKey` becomes `monitoring: { dsn: '' }`, and a mode file that set the key drops it. A deployed mode that reports names its DSN in its own file, `monitoring: { dsn: 'https://<public key>@<host>/<project id>' }`. Development and tunnel never read the config's DSN.
2. Caught by the compiler. An import of `~/lib/maple` becomes `~/lib/monitoring`; `mapleEnabled` of `~/lib/otel` becomes `monitoringEnabled` of `~/lib/monitoring`; `isMapleOptedIn` of `~/env` is gone. `reportReactError` takes the scope `'boundary'` or `'uncaught'` alone.
3. `frontend/package.json` drops `@maple-dev/browser` and takes `@sentry/browser` and, as a dev dependency, `@sentry/vite-plugin`, both `^11.16.0`; then `pnpm install`.
4. Not caught by the compiler. `VITE_MAPLE` leaves `frontend/.env`. A developer who runs a receiver sets `VITE_MONITORING_DSN` there, in the form `frontend/.env.example` shows; without it, development sends nothing.
5. Not caught by the compiler. An app's own privacy and legal texts that name Maple (a subprocessor row, a storage location, a cookie line) say what `monitoring.ts` sends to the app's own receiver, as cella's `privacy-text.tsx` and `legal-config.ts` do. One that read `maplePublicIngestKey` reads `monitoringEnabled`.
6. Not caught by the compiler. Per deployed environment: `pnpm cella infra apply --mode <mode>`, then deploy. The CSP drops `ingest.maple.dev` and names the DSN's origin.
7. No step: the browser exports no span. With a DSN the SDK sends the trace headers of API requests and `baggage: session.id=<id>`, which the backend records on request spans as `session.id` where it exports; without one, `otel.ts` sends `traceparent` as before.
8. No step: `reportCriticalError` also sends a handled event, the router's `notFound()` and `redirect()` report nothing, and a failed API response is the server's to report.
9. No step: every production bundle and map carries a debug id, and a build given `SENTRY_AUTH_TOKEN` and `SENTRY_URL` uploads its maps to that URL. The SDK loads in a `monitoring` chunk at boot, also without a DSN.
10. No step: outside production the debug menu offers `crash-content` and `crash-layout`, a render error under the content boundary or the app layout's root one.

## Verify

```sh
pnpm --filter frontend exec vitest run --project unit src/lib/monitoring.test.ts
pnpm check
```

By hand: start a receiver that accepts `POST /api/<project id>/envelope/`, set `VITE_MONITORING_DSN` to it, run
`pnpm dev`, open a page and pick `crash-content` in the debug menu: a session and an event arrive.
