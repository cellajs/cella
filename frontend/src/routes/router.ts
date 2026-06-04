import { createRouter } from '@tanstack/react-router';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { useUIStore } from '~/modules/ui/ui-store';
import { appStreamManager } from '~/query/realtime/stream-store';
import { routeTree } from '~/routes/route-tree';
import type { BoundaryType } from '~/routes/types';

/**
 * The router instance
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/createRouterFunction
 */
const router = createRouter({
  scrollRestoration: true,
  scrollRestorationBehavior: 'instant',
  defaultHashScrollIntoView: { behavior: 'smooth' },
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
router.subscribe('onBeforeLoad', ({ pathChanged, toLocation }) => {
  if (!pathChanged) return;

  // Clear focus view on route change to prevent stuck focus state
  if (useUIStore.getState().focusView) useUIStore.getState().setFocusView(false);

  // Boundary based cleanup
  const pendingMatches = router.matchRoutes(toLocation.pathname, toLocation.search);
  cleanupOnBoundaryChange(getBoundary(router.state.matches), getBoundary(pendingMatches));

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

export default router;
