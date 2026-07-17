# Frontend Library Notes

## Observability

Maple owns browser observability outside development: errors, session replay, tracing, and fetch spans. Its SDK registers the global tracing provider when enabled. In development, or when Maple is disabled, `otel.ts` registers a local WebTracerProvider so span helpers and sync devtools keep working without exporting spans.

The Maple replay setup masks inputs and rendered text before data leaves the browser. React error reporting still uses `console.error` because the SDK wraps console output as a capture path.

## History wrappers

`history-bind.ts` must load before observability, Maple, and the router. TanStack History and Maple both wrap `history.pushState` and `history.replaceState`; TanStack can invoke the active replacement detached from `history`. Binding the native methods before either wrapper is installed keeps every wrapper order receiver-safe and prevents navigation from leaving the address bar stale.
