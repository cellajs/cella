import { useEffect } from 'react';

// This hook is used to scroll to a specific HTML element
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
