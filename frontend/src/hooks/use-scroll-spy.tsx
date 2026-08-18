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

/** Current scroll-spy section; updates once scrolling settles or immediately on an explicit action. */
export const useCurrentSection = () => useSyncExternalStore(subscribeSection, getSection);
