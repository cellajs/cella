import { useNavigationStore } from '~/modules/navigation/navigation-store';

/** Whether a row's archived sub-rows show, closed until opened and remembered per row across edit mode and sheet openings. */
export function useSubmenuArchivedOpen(itemId: string) {
  const sectionKey = `${itemId}-archived`;
  const isOpen = useNavigationStore((state) => state.activeSections?.[sectionKey] ?? false);
  const setSectionOpen = useNavigationStore((state) => state.setSectionOpen);

  return [isOpen, (open: boolean) => setSectionOpen(sectionKey, open)] as const;
}
