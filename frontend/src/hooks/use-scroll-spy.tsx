import { useEffect, useSyncExternalStore } from 'react';
import { getSection, registerSections, subscribeSection, unregisterSections } from './use-scroll-spy-store';

/**
 * Register sections for scroll spy tracking. Hash is auto-written by the store.
 * For programmatic scrolling, import `scrollToSectionById` from `use-scroll-spy-store` directly.
 *
 * @example
 * useScrollSpy(['intro', 'features']);
 * const section = useCurrentSection();
 */
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
