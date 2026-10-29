# Frontend Library Notes

## Observability

Maple owns browser observability outside development; `maple.ts` lists what it collects. Its SDK registers the global tracing provider when enabled. In development, or with Maple disabled, `otel.ts` registers a local WebTracerProvider so span helpers and sync devtools keep working without exporting spans.

## History wrappers

`history-bind.ts` must load before observability, Maple, and the router. TanStack History and Maple both wrap `history.pushState` and `history.replaceState`, and TanStack can invoke the active replacement detached from `history`. Binding the native methods first keeps every wrapper order receiver-safe and stops navigation from leaving the address bar stale.

## Zod under the CSP

`zod-config.ts` sets zod's `jitless` option. zod decides per object schema, as the schema is built, whether to compile a parser with `new Function`, and probes for that once; the frontend's CSP forbids eval, so the probe is a reported violation on every page load even though zod catches the throw, and `jitless` skips it (parsing stays in plain code, which the CSP forced anyway). The call must run before `shared` and `sdk` build their schemas: `main.tsx` imports the module first, and the production build puts it in the zod chunk (`vite.config.ts`), so any chunk that imports zod runs it first.
