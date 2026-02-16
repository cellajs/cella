import { createRouter } from '@tanstack/react-router';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { routeTree } from '~/routes/route-tree';
import { useNavigationStore } from '~/store/navigation';
import { useUIStore } from '~/store/ui';

/**
 * Our Router instance
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

// Router lifecycle subscriptions
router.subscribe('onBeforeLoad', ({ pathChanged }) => {
  if (!pathChanged) return;

  if (useUIStore.getState().focusView) useUIStore.getState().setFocusView(false);
  useDialoger.getState().remove();
  // Note: Sheet cleanup for boundary changes is handled in layout route beforeLoad functions

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
