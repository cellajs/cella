import { useSheeter } from '~/modules/common/sheeter/use-sheeter';

/**
 * Closes the docs sidebar sheet right away; its slide-out runs on the compositor, so the next page can mount meanwhile.
 * The link parameter is unused and kept for current callers.
 */
export function closeDocsSidebarAfterNavigation(_link: HTMLAnchorElement) {
  useSheeter.getState().remove('docs-sidebar');
}
