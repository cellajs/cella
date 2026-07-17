import type { RegisteredRouter } from '@tanstack/react-router';

/**
 * Late-registered handle on the router instance, for consumers that need it outside React (plain
 * functions, stores, config objects) where `useRouter()` is unavailable.
 *
 * This module must never import `~/routes/router`. That module pulls in the generated route tree,
 * and the route tree reaches most of the app; a direct import here would put every consumer back
 * into one import cycle with it. Keeping this module dependency-free is the whole point.
 *
 * Inside a component, prefer `useRouter()` / `useNavigate()` over `getRouter()`.
 */
let instance: RegisteredRouter | null = null;

/** Called by `~/routes/router` as soon as the router is created. */
export const setRouter = (router: RegisteredRouter) => {
  instance = router;
};

/**
 * The router instance. Safe from any code path that runs after app startup; throws if called during
 * module evaluation of a route module, since those are evaluated before the router is created.
 */
export const getRouter = (): RegisteredRouter => {
  if (!instance) throw new Error('getRouter() called before the router was created');
  return instance;
};
