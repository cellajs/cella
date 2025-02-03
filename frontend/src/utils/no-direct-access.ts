import { redirect } from '@tanstack/react-router';

/**
 * Prevents direct access to a parent route by redirecting to a child route.
 *
 * @param pathname - Current URL pathname.
 * @param param - Parameter to check for in pathname.
 * @param redirectLocation - Child route to redirect to if direct access is attempted.
 * @throws Redirects to specified child route if the condition is met.
 */
export const noDirectAccess = (pathname: string, param: string, redirectLocation: string) => {
  if (!pathname.endsWith(param)) return;
  throw redirect({ to: pathname + redirectLocation, replace: true });
};
