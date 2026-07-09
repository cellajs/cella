/**
 * Pre-bind the native history methods before anything patches them.
 *
 * Several layers wrap `history.pushState`/`replaceState` at runtime: TanStack history
 * (router), and the Maple SDK's navigation capture + rrweb replay. TanStack's internal
 * `flush` invokes the current `history.replaceState` detached (`this === undefined`),
 * and Maple's capture teardown/re-init can leave its own wrapper on top with the raw
 * native captured underneath. That combination calls the unbound native and throws
 * "Illegal invocation" — after which the address bar silently stops updating while the
 * SPA keeps navigating, so the next full reload lands on a stale URL.
 *
 * Binding the natives up front makes every wrapper chain receiver-safe regardless of
 * patch order. Must be imported before ~/lib/otel, ~/lib/maple and the router.
 */
history.pushState = history.pushState.bind(history);
history.replaceState = history.replaceState.bind(history);
