import { useEffect } from 'react';

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
