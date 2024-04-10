import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

export const useScrollSpy = ({ sectionIds = [] }: { sectionIds: string[] }) => {
  const navigate = useNavigate();
  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // Initial mounting: scroll to the hash location
    const locationHash = location.hash.replace('#', '');

    if (sectionIds.includes(locationHash) && locationHash !== sectionIds[0]) {
      const element = document.getElementById(locationHash);
      if (!element) return;
      element.scrollIntoView();
    }
    document.documentElement.classList.add('scroll-smooth');

    return () => {
      document.documentElement.classList.remove('scroll-smooth');
    };
  }, []);

  useEffect(() => {
    const options = {
      root: null as Element | null,
      rootMargin: '-10% 0px -10% 0px',
      threshold: 0.2,
    };

    // Ensure observer is created only once
    if (!observer.current) {
      observer.current = new IntersectionObserver((entries) => {
        const intersectingEntries = entries.filter((entry) => entry.isIntersecting);
        if (intersectingEntries.length === 0 || intersectingEntries.length > 1) return;

        // TODO: how to recognize if two sections are intersecting?
        //console.log('intersectingEntries', intersectingEntries);
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const currentHashIndex = location.hash ? sectionIds.indexOf(location.hash.replace('#', '')) : 0;
            const entryIndex = sectionIds.indexOf(entry.target.id);

            // Determine scroll direction based on the boundingClientRect
            const scrollDirection: 'down' | 'up' = entry.boundingClientRect.top < 0 ? 'up' : 'down';

            // console.log(entry.target.id, 'scrollDirection', scrollDirection, 'entryIndex', entryIndex, 'currentHashIndex', currentHashIndex);

            if (
              // User scrolls down and the intersecting section is above the hash location section
              (scrollDirection === 'down' && entryIndex > currentHashIndex) ||
              // User scrolls up and the intersecting section is below the hash location section AND current section is NOT the top section
              (scrollDirection === 'up' && entryIndex < currentHashIndex)
            ) {
              const hash = entry.target.id;
              return navigate({ hash, replace: true });
            }
          }
        }
      }, options);
    }

    for (let i = 0; i < sectionIds.length; i++) {
      const id = sectionIds[i];
      const section = document.getElementById(id);
      if (section) observer.current?.observe(section);
    }

    return () => {
      observer.current?.disconnect();
    };
  }, [sectionIds]);

  return null;
};
