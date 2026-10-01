import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { getRouter } from '~/routes/-router-instance';

/** Upper bound on the wait, so a slow or failed load still closes the sheet. */
const MAX_WAIT_MS = 1000;

const closeSheet = () => useSheeter.getState().remove('docs-sidebar');

/**
 * Closes the docs sidebar sheet once the navigation started by `link` has rendered, so the new page mounts before the
 * slide-out starts and the slide runs on an idle main thread. A link to the current page closes it right away.
 */
export function closeDocsSidebarAfterNavigation(link: HTMLAnchorElement) {
  if (!useSheeter.getState().sheets.some((s) => s.id === 'docs-sidebar')) return;
  if (link.pathname === window.location.pathname) return closeSheet();

  const finish = () => {
    unsubscribe();
    clearTimeout(timer);
    closeSheet();
  };
  const unsubscribe = getRouter().subscribe('onResolved', finish);
  const timer = setTimeout(finish, MAX_WAIT_MS);
}
