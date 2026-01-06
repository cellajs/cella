import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

type IntersectionEntry = {
  id: string;
  ratio: number;
};

type UseScrollSpyProps = {
  sectionIds: string[];
  enableWriteHash?: boolean;
};

/**
 * Custom hook to track which section is currently visible in the viewport.
 * It uses Intersection Observer to monitor the visibility of sections based on their IDs.
 *
 * @param sectionIds - Array of section IDs to track and observe.
 * @param enableWriteHash - When true, updates the URL hash when the current section changes.
 *
 * @returns An object containing:
 * - `currentSection`: The section currently in view or with highest visibility ratio.
 * - `scrollToSection`: Function to programmatically scroll to a section without triggering hash updates during the scroll.
 */
export const useScrollSpy = ({ sectionIds = [], enableWriteHash = false }: UseScrollSpyProps) => {
  const navigate = useNavigate();
  const observer = useRef<IntersectionObserver | null>(null);

  // Maintain entries in a ref to avoid triggering re-renders
  const entriesRef = useRef<IntersectionEntry[]>(sectionIds.map((id) => ({ id, ratio: 0 }))); // Map to store id -> intersectionRatio

  // Track if we're in a programmatic scroll session
  const isProgrammaticScrollRef = useRef(false);

  // Current section is state since it's used for rendering
  const [currentSection, setCurrentSection] = useState<string>(sectionIds[0] || '');

  // Programmatically scroll to a section, pausing hash writes during the scroll
  const scrollToSection = (id: string) => {
    isProgrammaticScrollRef.current = true;

    // Navigate to 'top' first to reset if already at the target hash
    if (window.location.hash === `#${id}`) navigate({ to: '.', hash: 'top', replace: true });

    setTimeout(() => {
      navigate({ to: '.', hash: id, replace: true });

      // Re-enable hash writes after scroll animation completes
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 500);
    }, 20);
  };

  useEffect(() => {
    if (!sectionIds.length) return;

    // Handle hash scroll on mount
    const hash = location.hash.replace('#', '');
    if (hash && sectionIds.includes(hash)) {
      const element = document.getElementById(hash);
      if (element) element.scrollIntoView();
    }

    document.documentElement.classList.add('scroll-smooth');
    return () => document.documentElement.classList.remove('scroll-smooth');
  }, []);

  // Update URL hash when currentSection changes (skip during programmatic scroll)
  useEffect(() => {
    if (!enableWriteHash || !currentSection || isProgrammaticScrollRef.current) return;

    const currentHash = location.hash.replace('#', '');
    if (currentHash !== currentSection) {
      navigate({ hash: currentSection, hashScrollIntoView: false, replace: true });
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
      observedEntries.forEach((entry) => {
        const id = entry.target.id.replace('-anchor-wrap', '');
        if (id) {
          entriesRef.current.map((e) => {
            if (e.id === id) e.ratio = entry.intersectionRatio;
            return e;
          });
        }
      });

      // Determine the new current section
      const entriesArray = entriesRef.current;
      const fullyIntersecting = entriesArray.filter(({ ratio }) => ratio === 1);

      let newSection = entriesArray.find(({ id }) => id === currentSection);

      // If exactly one fully intersects, use that one
      if (fullyIntersecting.length === 1) {
        newSection = fullyIntersecting[0];

        // If more than one fully intersects
      } else if (fullyIntersecting.length > 1) {
        newSection = fullyIntersecting[0];

        // If none fully intersect, use highest ratio
      } else if (entriesArray.find(({ ratio }) => ratio > 0)) {
        const mostProminent = entriesArray.reduce((prev, curr) => (curr.ratio > prev.ratio ? curr : prev));
        newSection = mostProminent;
      }

      // Update state only if section changes
      if (newSection && newSection.id !== currentSection) {
        setCurrentSection(newSection.id);
      }
    }, options);

    sectionIds.forEach((id) => {
      const element = document.getElementById(`${id}-anchor-wrap`);
      if (element) observer.current?.observe(element);
    });

    return () => {
      observer.current?.disconnect();
    };
  }, [sectionIds, currentSection]);

  return { currentSection, scrollToSection };
};
