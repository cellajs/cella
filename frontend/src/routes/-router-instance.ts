import type { RegisteredRouter } from '@tanstack/react-router';

// Late-registered router for code outside React: importing the generated route tree here would be cyclic.
// Components use `useRouter` or `useNavigate`.
let instance: RegisteredRouter | null = null;

/** Called by `~/routes/router` as soon as the router is created. */
export const setRouter = (router: RegisteredRouter) => {
  instance = router;
};

/** Throws when called during route-module evaluation, which runs before the router is created. */
export const getRouter = (): RegisteredRouter => {
  if (!instance) throw new Error('getRouter() called before the router was created');
  return instance;
};
