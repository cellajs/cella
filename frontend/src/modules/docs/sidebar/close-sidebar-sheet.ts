import type { MouseEvent } from 'react';
import { type InternalSheet, sheeter } from '~/modules/common/sheeter/use-sheeter';
import { getRouter } from '~/routes/-router-instance';
import { isModifiedClick } from '~/utils/is-modified-click';

/** The sheet that holds the docs sidebar below `md`. */
export const docsSidebarSheetId = 'docs-sidebar';

/** A closed keepMounted sheet stays in the list with `open: false`. */
export const isDocsSidebarOpen = (sheets: InternalSheet[]) => sheets.some((sheet) => sheet.id === docsSidebarSheetId && sheet.open !== false);

/**
 * Click handler for a docs sidebar link. In the mobile sheet it closes the sheet and navigates a frame later, so the
 * slide-out starts before the new page renders under it. On desktop, and on a modified click, the link navigates as usual.
 */
export function closeSidebarSheetAndNavigate(e: MouseEvent<HTMLAnchorElement>) {
  if (isModifiedClick(e) || !isDocsSidebarOpen(sheeter.getState().sheets)) return;
  sheeter.getState().remove(docsSidebarSheetId);

  const href = e.currentTarget.getAttribute('href');
  if (!href) return;
  e.preventDefault();
  requestAnimationFrame(() => setTimeout(() => getRouter().navigate({ href })));
}
