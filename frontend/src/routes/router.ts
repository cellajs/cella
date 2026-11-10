import { createRouter } from '@tanstack/react-router';
import { type BoundaryType, boundaryOf } from '~/lib/boundary';
import type { PlacementDescriptor, Slot } from '~/lib/placements';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { PageSpinner } from '~/modules/common/spinner';
import { navigationStore } from '~/modules/navigation/navigation-store';
import type { NavItemId } from '~/modules/navigation/types';
import { uiStore } from '~/modules/ui/ui-store';
import { streamManager } from '~/query/realtime/stream-manager';
import { releaseTabLeadership } from '~/query/realtime/tab-coordinator';
import { RouteErrorComponent, RouteNotFoundComponent } from '~/routes/-route-utils';
import { setRouter } from '~/routes/-router-instance';
import { parseSearch, stringifySearch } from '~/routes/-search-serializer';
import { routeTree } from '~/routes/routeTree.gen';
import { setHasNavigated, setSkipPageEnter } from '~/utils/nav-transition';

/** @link https://tanstack.com/router/latest/docs/framework/react/api/router/createRouterFunction */
export const router = createRouter({
  scrollRestoration: true,
  scrollRestorationBehavior: 'instant',
  defaultHashScrollIntoView: { block: 'start', behavior: 'instant' },
  routeTree,
  defaultPreload: false,
  context: {},
  // Every search value is a string and a list its comma-separated values; a route schema coerces the rest
  parseSearch,
  stringifySearch,
  // Rendered where the route failed; both read the layouts still standing from `staticData.boundary`
  defaultErrorComponent: RouteErrorComponent,
  defaultNotFoundComponent: RouteNotFoundComponent,
  // A load that outlasts `defaultPendingMs` shows the spinner where the page will be; on a cold load that is the whole page
  defaultPendingComponent: PageSpinner,
  defaultPendingMs: 1000,
  defaultPendingMinMs: 0,
});

setRouter(router);

const cleanupOnBoundaryChange = (current?: BoundaryType, pending?: BoundaryType) => {
  if (!current || !pending || current === pending) return;
  sheeter.getState().remove(undefined, { isCleanup: true });
  navigationStore.getState().setNavSheetOpen(null);
  if (pending === 'public') {
    // Release leadership so a follower tab is promoted and keeps the SSE alive.
    streamManager.disconnect();
    releaseTabLeadership();
  }
};

// Whether the latest history action navigated forward (PUSH, REPLACE); BACK, FORWARD and GO traverse the history.
let isForward = true;
router.history.subscribe(({ action }) => {
  isForward = action.type === 'PUSH' || action.type === 'REPLACE';
  // A page load only replaces: its redirects and slug rewrites
  if (action.type !== 'REPLACE') setHasNavigated();
});

router.subscribe('onBeforeLoad', ({ pathChanged, toLocation }) => {
  if (!pathChanged) return;

  if (uiStore.getState().focusView) uiStore.getState().setFocusView(false);

  // Matched by path only: static data lives on the routes, and the load that follows validates the search.
  const [pendingRoutes] = router.getMatchedRoutes(toLocation.pathname);
  cleanupOnBoundaryChange(
    boundaryOf(router.state.matches.map((match) => match.staticData)),
    boundaryOf(pendingRoutes.map((route) => route.options.staticData)),
  );

  // A forward navigation staying on the same leaf route has no scroll delta to mask.
  const fromLeafId = router.state.matches.at(-1)?.routeId;
  const toLeafId = pendingRoutes.at(-1)?.id;
  setSkipPageEnter(!!fromLeafId && fromLeafId === toLeafId && isForward);
});

// The router scrolls a hash link only to a target the page renders and skips its scroll to top whenever a hash is set,
// so a forward link to a page without that target would keep the previous page's scroll.
router.subscribe('onRendered', ({ pathChanged, toLocation }) => {
  if (!pathChanged || !isForward || !toLocation.hash || document.getElementById(toLocation.hash)) return;
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
});

// The router's types live in the file that creates it: its registration, and what a route may declare in `staticData`.
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }

  interface StaticDataRouteOption {
    /** The layout this route stands up: an error or not-found notice below it reads the layouts still standing from the nearest one. */
    boundary?: BoundaryType;
    /** Where the home button of an error or not-found notice at or below this route leads; `/` without one. */
    errorHome?: string;
    /** Nav items floating on a phone in place of the bottom bar; `right` stays empty where a page floats its main action. */
    floatingNavButtons?: { right?: NavItemId; left?: NavItemId };
    /** Nav tab placement for PageTabNav: default order 0, lower first, ties keep route order. */
    navTab?: PlacementDescriptor;
    /** The placement surface this route's tab bar is: its tabs resolve against `appConfig.surfaces[tabsSlot]`. A tabbed layout route must declare it. */
    tabsSlot?: Slot;
  }
}
