import { useEffect, useSyncExternalStore } from 'react';
import { getSection, registerSections, subscribeSection, unregisterSections } from './use-scroll-spy-store';

/** Register sections whose active ID the scroll-spy store writes to the URL hash. */
export const useScrollSpy = (sectionIds?: string[]) => {
  useEffect(() => {
    if (sectionIds?.length) {
      registerSections(sectionIds);
      return () => unregisterSections(sectionIds);
    }
  }, [sectionIds]);
};

/**
 * Subscribe to the current scroll-spy section.
 * Updates after scrolling settles (150ms idle) or immediately on explicit actions.
 */
export const useCurrentSection = () => useSyncExternalStore(subscribeSection, getSection);
