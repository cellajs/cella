# Frontend Library Notes

## Observability

Maple owns browser observability outside development; `maple.ts` lists what it collects. Its SDK registers the global tracing provider when enabled. In development, or with Maple disabled, `otel.ts` registers a local WebTracerProvider so span helpers and sync devtools keep working without exporting spans.

## History wrappers

`history-bind.ts` must load before observability, Maple, and the router. TanStack History and Maple both wrap `history.pushState` and `history.replaceState`, and TanStack can invoke the active replacement detached from `history`. Binding the native methods first keeps every wrapper order receiver-safe and stops navigation from leaving the address bar stale.
