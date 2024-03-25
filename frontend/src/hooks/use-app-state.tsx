import { useEffect, useState } from 'react';

// This hook is used to check if the user has scrolled, if app has started and if it's ready
export const useAppState = () => {
  const [hasScrolled, setScrolled] = useState(false);
  const [hasStarted, setStarted] = useState(false);
  const [isReady, setReady] = useState(false);

  useEffect(() => {
    const scrollListener = () => {
      setScrolled(true);
      window.removeEventListener('scroll', scrollListener);
    };

    window.addEventListener('scroll', scrollListener);

    const startTimeout = setTimeout(() => setStarted(true), 200);
    const readyTimeout = setTimeout(() => setReady(true), 800);

    return () => {
      clearTimeout(startTimeout);
      clearTimeout(readyTimeout);
      window.removeEventListener('scroll', scrollListener);
    };
  }, []);

  return {
    hasScrolled,
    hasStarted,
    isReady,
  };
};

export default useAppState;