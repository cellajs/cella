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

/** Subscribe to the current scroll-spy section. Rerenders only when the active section changes. */
export const useCurrentSection = () => useSyncExternalStore(subscribeSection, getSection, getSection);
