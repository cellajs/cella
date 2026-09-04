import { createRouter } from '@tanstack/react-router';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { useUIStore } from '~/modules/ui/ui-store';
import { appStreamManager } from '~/query/realtime/stream-store';
import { releaseTabLeadership } from '~/query/realtime/tab-coordinator';
import { createNotFoundComponent } from '~/routes/-route-utils';
import { setRouter } from '~/routes/-router-instance';
import { routeTree } from '~/routes/routeTree.gen';
import type { BoundaryType } from '~/routes/types';
import { setSkipPageEnter } from '~/utils/nav-transition';

/**
 * The router instance
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/createRouterFunction
 */
const router = createRouter({
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
  matches?.findLast((m) => m.staticData.boundary)?.staticData.boundary;

const cleanupOnBoundaryChange = (current?: BoundaryType, pending?: BoundaryType) => {
  if (!current || !pending || current === pending) return;
  useSheeter.getState().remove(undefined, { isCleanup: true });
  useNavigationStore.getState().setNavSheetOpen(null);
  if (pending === 'public') {
    // Release leadership so a follower tab is promoted and keeps the SSE alive.
    appStreamManager.disconnect();
    releaseTabLeadership();
  }
};

// Router lifecycle subscriptions
// Track the latest history action: PUSH/REPLACE = forward/new, BACK/FORWARD/GO = history traversal.
let lastHistoryAction = 'PUSH';
router.history.subscribe(({ action }) => {
  lastHistoryAction = action.type;
});

router.subscribe('onBeforeLoad', ({ pathChanged, toLocation }) => {
  if (!pathChanged) return;

  if (useUIStore.getState().focusView) useUIStore.getState().setFocusView(false);

  const pendingMatches = router.matchRoutes(toLocation.pathname, toLocation.search);
  cleanupOnBoundaryChange(getBoundary(router.state.matches), getBoundary(pendingMatches));

  // A forward navigation staying on the same leaf route has no scroll delta to mask.
  const fromLeafId = router.state.matches.at(-1)?.routeId;
  const toLeafId = pendingMatches.at(-1)?.routeId;
  const isForward = lastHistoryAction === 'PUSH' || lastHistoryAction === 'REPLACE';
  setSkipPageEnter(!!fromLeafId && fromLeafId === toLeafId && isForward);
});

// Type registration must live in the file that creates the router.
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export { router };
