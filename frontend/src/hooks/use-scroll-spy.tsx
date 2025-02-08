import { useEffect, useRef, useState } from 'react';

type IntersectionEntry = {
  id: string;
  ratio: number;
};

/**
 * Custom hook to track which section is currently visible in the viewport.
 * It uses Intersection Observer to monitor the visibility of sections based on their IDs.
 *
 * @param sectionIds - Array of section IDs to track and observe.
 *
 * @returns An object containing the `currentSection` state, which represents the section
 * that is currently in view or has the highest visibility ratio.
 */

export const useScrollSpy = ({ sectionIds = [] }: { sectionIds: string[] }) => {
  const observer = useRef<IntersectionObserver | null>(null);

  // Maintain entries in a ref to avoid triggering re-renders
  const entriesRef = useRef<IntersectionEntry[]>(sectionIds.map((id) => ({ id, ratio: 0 }))); // Map to store id -> intersectionRatio

  // Current section is state since it's used for rendering
  const [currentSection, setCurrentSection] = useState<string>(sectionIds[0] || '');

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
      // biome-ignore lint/complexity/noForEach: <explanation>
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

    // biome-ignore lint/complexity/noForEach: <explanation>
    sectionIds.forEach((id) => {
      const element = document.getElementById(`${id}-anchor-wrap`);
      if (element) observer.current?.observe(element);
    });

    return () => {
      observer.current?.disconnect();
    };
  }, [sectionIds, currentSection]);

  return { currentSection };
};
