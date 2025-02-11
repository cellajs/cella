import { useEffect } from 'react';

/**
 * Custom hook to scroll to a specific HTML element.
 * It automatically scrolls the window to the element's position when the reference is updated.
 *
 * @param scrollToRef - A ref pointing to the HTML element to scroll to.
 */
const useScrollTo = (scrollToRef: React.RefObject<HTMLElement>) => {
  useEffect(() => {
    if (scrollToRef.current) {
      window.scrollTo({
        top: scrollToRef.current.offsetTop,
      });
    }
  }, [scrollToRef]);
};

export default useScrollTo;
