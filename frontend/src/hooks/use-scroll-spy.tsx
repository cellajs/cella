import { useEffect } from 'react';
import { registerSections, scrollToSectionById, unregisterSections } from './scroll-spy-store';

/**
 * Register sections for scroll spy tracking. Hash is auto-written by the store.
 *
 * @example
 * useScrollSpy(['intro', 'features']);
 * const currentSection = useLocation().hash.replace('#', '');
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
