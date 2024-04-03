import { useState, useEffect } from 'react';
import throttle from 'lodash/fp/throttle';

export interface useScrollSpyParams {
  activeSectionDefault?: number;
  offsetPx?: number;
  sectionElementRefs: React.RefObject<HTMLElement>[];
  throttleMs?: number;
  scrollingElement?: React.RefObject<HTMLElement>;
}
export const useScrollSpy = ({
  activeSectionDefault = 0,
  offsetPx = 0,
  scrollingElement,
  sectionElementRefs = [],
  throttleMs = 100,
}: useScrollSpyParams): number | undefined => {
  const [activeSection, setActiveSection] = useState(activeSectionDefault);

  const handle = throttle(throttleMs, () => {
    let currentSectionId = activeSection;
    for (let i = 0; i < sectionElementRefs.length; i += 1) {
      const section = sectionElementRefs[i].current;
      // Needs to be a valid DOM Element
      if (!section || !(section instanceof Element)) continue;
      // GetBoundingClientRect returns values relative to viewport
      if (section.getBoundingClientRect().top + offsetPx < 0) {
        currentSectionId = i;
        continue;
      }
      // No need to continue loop, if last element has been detected
      break;
    }

    setActiveSection(currentSectionId);
  });

  useEffect(() => {
    const scrollable = scrollingElement?.current ?? window;
    scrollable.addEventListener('scroll', handle);

    // Run initially
    handle();

    return () => {
      scrollable.removeEventListener('scroll', handle);
    };
  }, [sectionElementRefs, offsetPx, scrollingElement, handle]);
  return activeSection;
};
