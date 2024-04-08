import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';

export const useSetHashOnScroll = ({ sectionIds = [], useRouter }: { sectionIds: string[]; useRouter?: boolean }) => {
  const navigate = useNavigate();
  const observer = useRef<IntersectionObserver | null>(null);

  // State to store the last known Y position to determine scroll direction
  const lastYPosition = useRef<number>(window.scrollY);

  // State to track the direction of the scroll, 'down' or 'up'
  const [scrollDirection, setScrollDirection] = useState<'down' | 'up'>('down');

  useEffect(() => {
    const updateScrollDirection = () => {
      const scrollY = window.scrollY;
      const newDirection: 'down' | 'up' = scrollY > lastYPosition.current ? 'down' : 'up';
      setScrollDirection(newDirection);
      lastYPosition.current = scrollY;
    };

    window.addEventListener('scroll', updateScrollDirection);
    return () => window.removeEventListener('scroll', updateScrollDirection);
  }, []);

  useEffect(() => {
    const options = {
      root: null as Element | null,
      rootMargin: '0px',
      threshold: 0.5,
    };

    observer.current = new IntersectionObserver((entries) => {
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (entry.isIntersecting) {
          const hashSectionIndex = location.hash ? sectionIds.indexOf(location.hash.replace('#', '')) : 0;
          const intersectingSectionIndex = sectionIds.indexOf(entry.target.id);

          // Update hash only if the intersecting section aligns with the scroll direction and position.
          if (
            // User scrolls down and the intersecting section is above the hash location section
            (scrollDirection === 'down' && intersectingSectionIndex > hashSectionIndex) ||
            // User scrolls up and the intersecting section is below the hash location section AND current section is NOT the top section
            (scrollDirection === 'up' && intersectingSectionIndex > 0 && intersectingSectionIndex < hashSectionIndex) ||
            // User scrolls up from the second section to the top section
            (scrollDirection === 'up' && intersectingSectionIndex === 0 && hashSectionIndex === 1)
          ) {
            const hash = entry.target.id;
            if (useRouter) return navigate({ hash, replace: true });
            window.location.hash = hash;
          }
        }
      }
    }, options);

    // Replace forEach with a traditional for loop for observing sections
    for (let i = 0; i < sectionIds.length; i++) {
      const id = sectionIds[i];
      const section = document.getElementById(id);
      if (section) observer.current?.observe(section);
    }

    return () => observer.current?.disconnect();
  }, [scrollDirection, location]);

  return null; // This hook does not directly render anything
};
