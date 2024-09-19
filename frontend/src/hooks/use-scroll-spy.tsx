import { useEffect, useRef, useState } from 'react';

export const useScrollSpy = ({ sectionIds = [], autoUpdateHash }: { sectionIds: string[]; autoUpdateHash?: boolean }) => {
  const observer = useRef<IntersectionObserver | null>(null);

  // Maintain a list of intersecting section ids
  const intersectingIdsRef = useRef<string[]>([]);

  // Maintain scroll direction
  const scrollDirectionRef = useRef<'down' | 'up'>('down');

  const [activeHash, setActiveHash] = useState<string>(sectionIds[0]);

  useEffect(() => {
    // Initial mounting: scroll to the hash location
    const locationHash = location.hash.replace('#', '');

    if (sectionIds.includes(locationHash) && locationHash !== sectionIds[0]) {
      const element = document.getElementById(locationHash);
      if (!element) return;
      element.scrollIntoView();
    }
    document.documentElement.classList.add('scroll-smooth');

    return () => document.documentElement.classList.remove('scroll-smooth');
  }, []);

  useEffect(() => {
    const options: IntersectionObserverInit = {
      root: null,
      rootMargin: '-10% 0% -10% 0%',
      threshold: [0.1, 1],
    };

    if (!autoUpdateHash) return;

    // Ensure observer is created only once
    if (!observer.current) {
      observer.current = new IntersectionObserver((entries) => {
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];

          const id = entry.target.id;
          const currentIntersectingIds: string[] = intersectingIdsRef.current;
          const index = currentIntersectingIds.indexOf(id);

          if (entry.isIntersecting) {
            if (entry.target.id === sectionIds[sectionIds.length - 1] && entry.intersectionRatio === 1)
              return setActiveHash(sectionIds[sectionIds.length - 1]);
            // Is intersecting and not yet in array
            if (index === -1) {
              // console.log('entering', entry.target.id, index, intersectingIdsRef.current);
              // Use boundingClientRect to determine scroll direction
              scrollDirectionRef.current = entry.boundingClientRect.top < 0 ? 'up' : 'down';

              // Add to array
              intersectingIdsRef.current = [...currentIntersectingIds, id];
            }
          } else {
            // No longer intersecting and still in array
            if (index !== -1) {
              // console.log('leaving', entry.target.id, index, intersectingIdsRef.current.length);
              // Use boundingClientRect to determine scroll direction
              scrollDirectionRef.current = entry.boundingClientRect.top < 0 ? 'down' : 'up';

              // Remove from array
              intersectingIdsRef.current = currentIntersectingIds.filter((currentId) => currentId !== id);
            }
          }
        }

        // console.log(entries);

        // Get the current hash and index
        // const currentHash = location.hash.replace('#', '');
        // const currentHashIndex = currentHash ? sectionIds.indexOf(currentHash) : 0;

        // Sorted array of intersecting sections
        const intersecting = intersectingIdsRef.current.sort((a, b) => sectionIds.indexOf(a) - sectionIds.indexOf(b));

        let mainSection = intersecting[0];

        // If two intersecting, we should limit our scope to the one on top of our scroll direction
        if (intersecting.length === 2 && scrollDirectionRef.current === 'down') mainSection = intersecting[intersecting.length - 1];

        const fullyIntersecting = intersecting.slice(1, -1);

        // If three or more intersecting, we should limit our scope to fully intersecting sections
        if (intersecting.length > 2) {
          mainSection = scrollDirectionRef.current === 'down' ? fullyIntersecting[fullyIntersecting.length - 1] : fullyIntersecting[0];
        }

        // const mainSectionIndex = sectionIds.indexOf(mainSection);
        // console.log(
        //   fullyIntersecting,
        //   fullyIntersecting.length,
        //   Math.floor(fullyIntersecting.length / 2),
        //   scrollDirectionRef.current,
        //   intersectingIdsRef.current,
        //   currentHashIndex,
        //   mainSection,
        //   mainSectionIndex,
        // );

        // Update the active hash
        // console.log('MAINS', mainSection, activeHash)
        setActiveHash(mainSection);

        // if (
        //   // User scrolls down and the main intersecting section is above the hash location section
        //   (scrollDirectionRef.current === 'down' && mainSectionIndex > currentHashIndex) ||
        //   // User scrolls up and the main intersecting section is below the hash location section AND current section is NOT the top section
        //   (scrollDirectionRef.current === 'up' && mainSectionIndex < currentHashIndex)
        // ) {
        //   return navigate({ search: {section: mainSection}, replace: true });
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

  return { activeHash };
};
