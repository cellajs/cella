# Frontend Library Notes

## Observability

With a DSN, `monitoring.ts` sends errors and one session per page load to it through Sentry's browser SDK, in the Sentry envelope protocol any compatible receiver accepts. It names the signed-in user by id alone, and an error at any React boundary is unhandled. No span and no web vital leaves the browser.

The mode's config names the DSN (`monitoring.dsn`), and on this machine a portless `localhost` one takes the app's origin. In development and tunnel `VITE_MONITORING_DSN` from `frontend/.env` wins; without either the page sends nothing.

The SDK sends the trace headers of every request to the API and to the authorization server, and `monitoring.ts` adds the session's id to each one's `baggage`. `otel.ts` keeps a local tracer in every mode for the span helpers and the sync devtools; it sends the trace headers itself only when no DSN is set.

## History wrappers

`history-bind.ts` must load before monitoring and the router. TanStack History and the monitoring SDK both wrap `history.pushState` and `history.replaceState`, and TanStack can invoke the active replacement detached from `history`. Binding the native methods first keeps every wrapper order receiver-safe and stops navigation from leaving the address bar stale.

## Zod under the CSP

`zod-config.ts` sets zod's `jitless` option. zod decides per object schema, as the schema is built, whether to compile a parser with `new Function`, and probes for that once. The frontend's CSP forbids eval. The probe is then a reported violation on every page load even though zod catches the throw, and `jitless` skips it (parsing stays in plain code, which the CSP forced anyway).

The call must run before `shared` and `sdk` build their schemas: `main.tsx` imports the module first, and the production build puts it in the zod chunk (`vite.config.ts`). Any chunk that imports zod then runs it first.
