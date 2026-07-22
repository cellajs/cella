import type { RegisteredRouter } from '@tanstack/react-router';

/**
 * Expose a late-registered router outside React without importing the cyclic generated route tree.
 * Components should prefer `useRouter` or `useNavigate`.
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
