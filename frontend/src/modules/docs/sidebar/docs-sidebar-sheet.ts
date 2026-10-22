import type { MouseEvent } from 'react';
import { type InternalSheet, sheeter } from '~/modules/common/sheeter/use-sheeter';
import { getRouter } from '~/routes/-router-instance';
import { isModifiedClick } from '~/utils/is-modified-click';

/** The sheet that holds the docs sidebar below `md`. */
export const docsSidebarSheetId = 'docs-sidebar';

/** A closed keepMounted sheet stays in the list with `open: false`. */
export const isDocsSidebarOpen = (sheets: InternalSheet[]) => sheets.some((sheet) => sheet.id === docsSidebarSheetId && sheet.open !== false);

/** In the open mobile sheet: closes it and navigates a frame later, so the slide-out starts before the new page renders. Otherwise a plain link. */
export function closeSidebarSheetAndNavigate(event: MouseEvent<HTMLAnchorElement>) {
  if (isModifiedClick(event) || !isDocsSidebarOpen(sheeter.getState().sheets)) return;
  sheeter.getState().remove(docsSidebarSheetId);

  const href = event.currentTarget.getAttribute('href');
  if (!href) return;
  event.preventDefault();
  requestAnimationFrame(() => setTimeout(() => getRouter().navigate({ href })));
}
