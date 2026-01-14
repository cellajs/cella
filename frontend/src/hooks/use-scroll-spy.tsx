import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useHasScrolled } from '~/hooks/use-has-scrolled';

type IntersectionEntry = {
  id: string;
  ratio: number;
};

type UseScrollSpyProps = {
  sectionIds?: string[];
  enableWriteHash?: boolean;
  /** When true (default), uses smooth scrolling. When false, uses instant scroll. */
  smoothScroll?: boolean;
};

/**
 * Custom hook to track which section is currently visible in the viewport.
 * It uses Intersection Observer to monitor the visibility of sections based on their IDs.
 *
 * @param sectionIds - Array of section IDs to track and observe.
 * @param enableWriteHash - When true, updates the URL hash when the current section changes.
 * @param smoothScroll - When true (default), uses smooth scrolling. When false, uses instant scroll.
 *
 * @returns An object containing:
 * - `currentSection`: The section currently in view or with highest visibility ratio.
 * - `scrollToSection`: Function to programmatically scroll to a section without triggering hash updates during the scroll.
 */
export const useScrollSpy = ({ sectionIds = [], enableWriteHash = false, smoothScroll = true }: UseScrollSpyProps) => {
  const navigate = useNavigate();
  const observer = useRef<IntersectionObserver | null>(null);

  // Maintain entries in a ref to avoid triggering re-renders - initialize synchronously
  const entriesRef = useRef<IntersectionEntry[]>(sectionIds.map((id) => ({ id, ratio: 0 })));

  // Track if we're in a programmatic scroll session
  const isProgrammaticScrollRef = useRef(false);

  // Track if user has scrolled - only write hash after user interaction or if hash existed initially
  const hasScrolled = useHasScrolled({ delay: 1000 });
  const hadInitialHash = useRef(!!location.hash);

  // Determine initial section from hash only if hash exists and is valid
  const getInitialSection = () => {
    const hash = location.hash.replace('#', '');
    if (hash && sectionIds.includes(hash)) return hash;
    return ''; // Don't default to first section - let IntersectionObserver determine it
  };

  // Current section is state since it's used for rendering
  const [currentSection, setCurrentSection] = useState<string>(getInitialSection);

  // Update entriesRef when sectionIds change (for dynamic section lists)
  useEffect(() => {
    entriesRef.current = sectionIds.map((id) => ({ id, ratio: 0 }));
  }, [sectionIds]);

  // Programmatically scroll to a section, pausing hash writes during the scroll
  const scrollToSection = (id: string) => {
    isProgrammaticScrollRef.current = true;

    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: smoothScroll ? 'smooth' : 'instant' });
    }

    // Only update hash if enableWriteHash is true
    if (enableWriteHash) {
      // Navigate to 'top' first to reset if already at the target hash
      if (window.location.hash === `#${id}`) navigate({ to: '.', search: (prev) => prev, hash: 'top', replace: true });

      setTimeout(() => {
        navigate({
          to: '.',
          search: (prev) => prev,
          hash: id,
          replace: true,
          hashScrollIntoView: false,
        });
      }, 20);
    }

    // Re-enable hash writes after scroll animation completes
    setTimeout(
      () => {
        isProgrammaticScrollRef.current = false;
      },
      smoothScroll ? 500 : 50,
    );
  };

  /**
   * Scroll to hash on initial page load.
   * This is necessary because the browser's native hash scroll may fire before
   * React hydration completes or before section elements are rendered.
   * Without this, navigating directly to a URL with a hash (e.g., /legal#security)
   * would show the wrong section highlighted or not scroll to the correct position.
   */
  const hasScrolledToHash = useRef(false);

  useEffect(() => {
    if (!sectionIds.length || hasScrolledToHash.current) return;

    const hash = location.hash.replace('#', '');
    if (hash && sectionIds.includes(hash)) {
      // Use requestAnimationFrame to ensure DOM is ready before scrolling
      const scrollToHash = () => {
        const element = document.getElementById(hash);
        if (element) {
          element.scrollIntoView({ behavior: 'instant' });
          hasScrolledToHash.current = true;
        }
      };

      // Double RAF ensures layout is complete
      requestAnimationFrame(() => requestAnimationFrame(scrollToHash));
    }
  }, [sectionIds]);

  // Update URL hash when currentSection changes (skip during programmatic scroll)
  useEffect(() => {
    if (!enableWriteHash || !currentSection || isProgrammaticScrollRef.current) return;
    // Only write hash if there was an initial hash or user has scrolled - prevents adding hash on first load
    if (!hadInitialHash.current && !hasScrolled) return;

    const currentHash = location.hash.replace('#', '');
    if (currentHash !== currentSection) {
      navigate({ to: '.', search: (prev) => prev, hash: currentSection, hashScrollIntoView: false, replace: true });
    }
  }, [enableWriteHash, currentSection, navigate]);

  useEffect(() => {
    const options: IntersectionObserverInit = {
      root: null,
      rootMargin: '0% 0% 0% 0%',
      threshold: [0, 1],
    };

    if (observer.current) {
      observer.current.disconnect(); // Reset observer
    }

    observer.current = new IntersectionObserver((observedEntries) => {
      // Update entries in the ref
      for (const entry of observedEntries) {
        const id = entry.target.id;
        const entryRecord = entriesRef.current.find((e) => e.id === id);
        if (entryRecord) entryRecord.ratio = entry.intersectionRatio;
      }

      // Determine the new current section
      const entriesArray = entriesRef.current;
      const fullyIntersecting = entriesArray.filter(({ ratio }) => ratio === 1);

      let newSection: IntersectionEntry | undefined;

      // If any fully intersect, pick the one closest to the top of the viewport
      if (fullyIntersecting.length > 0) {
        if (fullyIntersecting.length === 1) {
          newSection = fullyIntersecting[0];
        } else {
          // Sort by vertical position (closest to top wins)
          const sorted = fullyIntersecting
            .map((entry) => {
              const el = document.getElementById(entry.id);
              return { ...entry, top: el?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY };
            })
            .sort((a, b) => a.top - b.top);
          newSection = sorted[0];
        }
      } else {
        // Otherwise use highest ratio
        const mostProminent = entriesArray.reduce((prev, curr) => (curr.ratio > prev.ratio ? curr : prev), {
          id: '',
          ratio: 0,
        });
        if (mostProminent.ratio > 0) newSection = mostProminent;
      }

      // Update state only if section changes
      if (newSection) {
        setCurrentSection((prev) => (prev !== newSection.id ? newSection.id : prev));
      }
    }, options);

    // Observe each section element
    sectionIds.forEach((id) => {
      const element = document.getElementById(id);
      if (element) observer.current?.observe(element);
    });

    // Cleanup on unmount
    return () => {
      observer.current?.disconnect();
    };
  }, [sectionIds]);

  return { currentSection, scrollToSection };
};
