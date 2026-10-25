import { useEffect, useSyncExternalStore } from 'react';
import { getSection, registerSections, subscribeSection, unregisterSections } from '~/hooks/scroll-spy-store';

/** Register sections whose active ID the scroll-spy store writes to the URL hash. */
export const useScrollSpy = (sectionIds?: readonly string[]) => {
  // Keyed on the ids, not the array: callers map a fresh array each render, and re-registering rebuilds the observer.
  // Section ids are DOM id suffixes, which can't hold whitespace, so the newline join round-trips.
  const idsKey = sectionIds?.join('\n') ?? '';

  useEffect(() => {
    if (!idsKey) return;
    const ids = idsKey.split('\n');
    registerSections(ids);
    return () => unregisterSections(ids);
  }, [idsKey]);
};

/** Current scroll-spy section; updates once scrolling settles or immediately on an explicit action. */
export const useCurrentSection = () => useSyncExternalStore(subscribeSection, getSection);

interface RegisterSpySectionsProps {
  ids: readonly string[];
}

/** Render after lazy content inside its Suspense boundary: the spy only observes anchors that exist at registration time. */
export function RegisterSpySections({ ids }: RegisterSpySectionsProps) {
  useScrollSpy(ids);
  return null;
}
