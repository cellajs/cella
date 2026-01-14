import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  canWriteHash,
  getServerSnapshot,
  getSnapshot,
  isInProgrammaticScroll,
  registerSections,
  scrollToSection as scrollToSectionStore,
  subscribe,
  unregisterSections,
} from './scroll-spy-store';

type UseScrollSpyProps = {
  /** Array of section IDs to contribute. Multiple instances can contribute sections. */
  sectionIds?: string[];
  /** When true, updates the URL hash when current section changes. Only one instance should enable this. */
  enableWriteHash?: boolean;
  /** When true (default), uses smooth scrolling. When false, uses instant scroll. */
  smoothScroll?: boolean;
  /** When true (default), subscribes to currentSection changes. Set false to avoid re-renders. */
  subscribeToChanges?: boolean;
};

/**
 * Track which section is currently visible in the viewport.
 * Uses a shared IntersectionObserver - multiple instances can contribute sections.
 *
 * @param sectionIds - Array of section IDs to contribute. Each instance owns its contributed sections.
 * @param enableWriteHash - When true, updates URL hash on section change. Only one instance should enable this.
 * @param smoothScroll - When true (default), uses smooth scrolling.
 * @param subscribeToChanges - When true (default), subscribes to section changes. Set false to register sections without re-rendering.
 *
 * @example
 * // Page level - contributes main sections, controls hash, no subscription needed
 * useScrollSpy({ sectionIds: ['intro', 'features'], enableWriteHash: true, subscribeToChanges: false });
 *
 * // Component level - contributes its own section
 * useScrollSpy({ sectionIds: [myId] });
 *
 * // Consumer - just reads state
 * const { currentSection } = useScrollSpy();
 */
export const useScrollSpy = ({
  sectionIds,
  enableWriteHash = false,
  smoothScroll = true,
  subscribeToChanges = true,
}: UseScrollSpyProps = {}) => {
  const navigate = useNavigate();

  // Stable component ID for tracking contributions
  const componentIdRef = useRef(`scrollspy-${Math.random().toString(36).slice(2, 9)}`);
  const hasContributions = sectionIds !== undefined && sectionIds.length > 0;

  // Only subscribe when needed - avoids re-renders for components that only contribute sections
  const noopSubscribe = () => () => {};
  const currentSection = useSyncExternalStore(
    subscribeToChanges ? subscribe : noopSubscribe,
    subscribeToChanges ? getSnapshot : () => '',
    getServerSnapshot,
  );

  // Register/unregister contributed sections
  useEffect(() => {
    if (hasContributions) {
      registerSections(componentIdRef.current, sectionIds);
      return () => unregisterSections(componentIdRef.current);
    }
  }, [hasContributions, sectionIds]);

  // Update URL hash when section changes (only if enableWriteHash and allowed)
  // This effect needs to subscribe independently when subscribeToChanges is false
  useEffect(() => {
    if (!enableWriteHash) return;

    const updateHash = () => {
      const section = getSnapshot();
      if (!section || isInProgrammaticScroll()) return;
      if (!canWriteHash()) return;

      const currentHash = location.hash.replace('#', '');
      if (currentHash !== section) {
        navigate({ to: '.', search: (prev) => prev, hash: section, hashScrollIntoView: false, replace: true });
      }
    };

    // If not subscribing to changes, set up our own subscription for hash writing
    if (!subscribeToChanges) {
      const unsubscribe = subscribe(updateHash);
      return () => {
        unsubscribe();
      };
    }

    // Otherwise use the subscribed currentSection
    updateHash();
  }, [enableWriteHash, subscribeToChanges, currentSection, navigate]);

  const scrollToSection = (id: string) => {
    scrollToSectionStore(id, smoothScroll, navigate);
  };

  return { currentSection, scrollToSection };
};
