import { type ErrorComponentProps, useMatch, useMatches } from '@tanstack/react-router';
import { boundaryOf } from '~/lib/boundary';
import { pageNotFoundError } from '~/modules/common/error-helpers';
import { ErrorNotice } from '~/modules/common/error-notice';

/** What stands around the route that failed: the boundary of the layouts above it, and the home its section names. */
function useFailedRouteFrame() {
  const routeId = useMatch({ strict: false, select: (match) => match.routeId });
  const matches = useMatches();
  const failedAt = matches.findIndex((match) => match.routeId === routeId);
  const above = matches.slice(0, failedAt);
  const homePath = matches.slice(0, failedAt + 1).findLast((match) => match.staticData.errorHome)?.staticData.errorHome;
  return { boundary: boundaryOf(above.map((match) => match.staticData)) ?? 'root', homePath };
}

/** The router's `defaultErrorComponent`: the notice where the failed route would render, inside the layouts it leaves standing. */
export function RouteErrorComponent({ error, reset }: ErrorComponentProps) {
  const { boundary, homePath } = useFailedRouteFrame();
  return <ErrorNotice error={error} resetErrorBoundary={reset} boundary={boundary} homePath={homePath} />;
}

/**
 * The router's `defaultNotFoundComponent`: a URL no route matches renders it at the deepest layout, a `notFound()` a
 * loader throws at the nearest route that declares `notFoundComponent`, so a route whose loader or page throws one
 * declares this component itself.
 */
export function RouteNotFoundComponent() {
  const { boundary, homePath } = useFailedRouteFrame();
  return <ErrorNotice boundary={boundary} error={pageNotFoundError()} homePath={homePath} />;
}

/** The `/error` page: the notice as a page, named by the `error` and `severity` search params. */
export function ErrorNoticePageComponent() {
  return <ErrorNotice boundary="public" />;
}
