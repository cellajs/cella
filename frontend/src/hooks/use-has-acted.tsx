import { useEffect, useState } from 'react';

// This hook is used to check if the user has started, scrolled
export const useHasActed = () => {
  const [hasScrolled, setScrolled] = useState(false);
  const [hasStarted, setStarted] = useState(false);

  const scrollListener = () => {
    setScrolled(true);
    window.removeEventListener('scroll', scrollListener);
  };

  window.addEventListener('scroll', scrollListener);

  // Cleanup just in case
  useEffect(() => {
    setTimeout(() => setStarted(true), 200);
    return () => {
      window.removeEventListener('scroll', scrollListener);
    };
  }, []);

  return {
    hasScrolled,
    hasStarted,
  };
};

export default useHasActed;
