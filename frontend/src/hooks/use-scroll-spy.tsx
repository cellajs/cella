import { useEffect, useSyncExternalStore } from 'react';
import {
  getSection,
  registerSections,
  scrollToSectionById,
  subscribeSection,
  unregisterSections,
} from './use-scroll-spy-store';

/**
 * Register sections for scroll spy tracking. Hash is auto-written by the store.
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

  return { scrollToSection: scrollToSectionById };
};

/**
 * Subscribe to the current scroll-spy section.
 * Updates after scrolling settles (150ms idle) or immediately on explicit actions.
 */
export const useCurrentSection = () => useSyncExternalStore(subscribeSection, getSection);
