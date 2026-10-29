import { createRouter } from '@tanstack/react-router';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { navigationStore } from '~/modules/navigation/navigation-store';
import { uiStore } from '~/modules/ui/ui-store';
import { appStreamManager } from '~/query/realtime/stream-manager';
import { releaseTabLeadership } from '~/query/realtime/tab-coordinator';
import { createNotFoundComponent } from '~/routes/-route-utils';
import { setRouter } from '~/routes/-router-instance';
import { routeTree } from '~/routes/routeTree.gen';
import type { BoundaryType } from '~/routes/types';
import { setSkipPageEnter } from '~/utils/nav-transition';

/** @link https://tanstack.com/router/latest/docs/framework/react/api/router/createRouterFunction */
export const router = createRouter({
  scrollRestoration: true,
  scrollRestorationBehavior: 'instant',
  defaultHashScrollIntoView: { block: 'start', behavior: 'instant' },
  routeTree,
  defaultPreload: false,
  context: {},
  defaultPendingMinMs: 0,
  // Covers not-founds scoped to an intermediate route; the root notFoundComponent only handles the root match.
  defaultNotFoundComponent: createNotFoundComponent('public'),
});

setRouter(router);

const getBoundary = (matches?: { staticData: { boundary?: BoundaryType } }[]) =>
  matches?.findLast((match) => match.staticData.boundary)?.staticData.boundary;

const cleanupOnBoundaryChange = (current?: BoundaryType, pending?: BoundaryType) => {
  if (!current || !pending || current === pending) return;
  sheeter.getState().remove(undefined, { isCleanup: true });
  navigationStore.getState().setNavSheetOpen(null);
  if (pending === 'public') {
    // Release leadership so a follower tab is promoted and keeps the SSE alive.
    appStreamManager.disconnect();
    releaseTabLeadership();
  }
};

// Whether the latest history action navigated forward (PUSH, REPLACE); BACK, FORWARD and GO traverse the history.
let isForward = true;
router.history.subscribe(({ action }) => {
  isForward = action.type === 'PUSH' || action.type === 'REPLACE';
});

router.subscribe('onBeforeLoad', ({ pathChanged, toLocation }) => {
  if (!pathChanged) return;

  if (uiStore.getState().focusView) uiStore.getState().setFocusView(false);

  const pendingMatches = router.matchRoutes(toLocation.pathname, toLocation.search);
  cleanupOnBoundaryChange(getBoundary(router.state.matches), getBoundary(pendingMatches));

  // A forward navigation staying on the same leaf route has no scroll delta to mask.
  const fromLeafId = router.state.matches.at(-1)?.routeId;
  const toLeafId = pendingMatches.at(-1)?.routeId;
  setSkipPageEnter(!!fromLeafId && fromLeafId === toLeafId && isForward);
});

// The router scrolls a hash link only to a target the page renders and skips its scroll to top whenever a hash is set,
// so a forward link to a page without that target would keep the previous page's scroll.
router.subscribe('onRendered', ({ pathChanged, toLocation }) => {
  if (!pathChanged || !isForward || !toLocation.hash || document.getElementById(toLocation.hash)) return;
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
});

// Type registration must live in the file that creates the router.
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
