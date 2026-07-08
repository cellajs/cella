import { createRouter } from '@tanstack/react-router';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { useUIStore } from '~/modules/ui/ui-store';
import { appStreamManager } from '~/query/realtime/stream-store';
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
});

/** Get the deepest boundary from a route match array (e.g. 'app' or 'public') */
const getBoundary = (matches?: { staticData: { boundary?: BoundaryType } }[]) =>
  matches?.findLast((m) => m.staticData.boundary)?.staticData.boundary;

/** Clean up sheets and streams when crossing layout boundaries (e.g. app <-> public) */
const cleanupOnBoundaryChange = (current?: BoundaryType, pending?: BoundaryType) => {
  if (!current || !pending || current === pending) return;
  useSheeter.getState().remove(undefined, { isCleanup: true });
  useNavigationStore.getState().setNavSheetOpen(null);
  if (pending === 'public') appStreamManager.disconnect();
};

/**
 * Router lifecycle subscriptions
 */
// Track the latest history action: PUSH/REPLACE = forward/new, BACK/FORWARD/GO = history traversal.
let lastHistoryAction = 'PUSH';
router.history.subscribe(({ action }) => {
  lastHistoryAction = action.type;
});

router.subscribe('onBeforeLoad', ({ pathChanged, toLocation }) => {
  if (!pathChanged) return;

  // Clear focus view on route change to prevent stuck focus state
  if (useUIStore.getState().focusView) useUIStore.getState().setFocusView(false);

  // Boundary based cleanup
  const pendingMatches = router.matchRoutes(toLocation.pathname, toLocation.search);
  cleanupOnBoundaryChange(getBoundary(router.state.matches), getBoundary(pendingMatches));

  // Skip the page-enter mask when moving between two pages of the same leaf route (e.g. org -> org)
  // via a forward navigation; there is no scroll delta to mask in that case.
  const fromLeafId = router.state.matches.at(-1)?.routeId;
  const toLeafId = pendingMatches.at(-1)?.routeId;
  const isForward = lastHistoryAction === 'PUSH' || lastHistoryAction === 'REPLACE';
  setSkipPageEnter(!!fromLeafId && fromLeafId === toLeafId && isForward);

  useNavigationStore.getState().setNavLoading(true);
});

router.subscribe('onLoad', () => {
  useNavigationStore.getState().setNavLoading(false);
});

// Register the router instance for type inference
// This must be in the same file that creates the router
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export { router };
