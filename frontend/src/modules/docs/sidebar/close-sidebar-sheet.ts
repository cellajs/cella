import type { MouseEvent } from 'react';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { getRouter } from '~/routes/-router-instance';

/**
 * Click handler for a docs sidebar link. In the mobile sheet it closes the sheet and navigates a frame later, so the
 * slide-out starts before the new page renders under it. On desktop, and on a modified click, the link navigates as usual.
 */
export function closeSidebarSheetAndNavigate(e: MouseEvent<HTMLAnchorElement>) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

  const sheet = sheeter.getState().get('docs-sidebar');
  if (!sheet || sheet.open === false) return;
  sheeter.getState().remove('docs-sidebar');

  const href = e.currentTarget.getAttribute('href');
  if (!href) return;
  e.preventDefault();
  requestAnimationFrame(() => setTimeout(() => getRouter().navigate({ href })));
}
