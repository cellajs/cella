import { useEffect, useState } from 'react';

// This hook is used to fire events when the app has scrolled, mounted (0 ms), started (+ 200ms), and waited (+ 800ms)
export const useMounted = () => {
  const [hasMounted, setMounted] = useState(false);
  const [hasStarted, setStarted] = useState(false);
  const [hasWaited, setWaited] = useState(false);

  useEffect(() => {
    setMounted(true);

    const startTimeout = setTimeout(() => setStarted(true), 200);
    const readyTimeout = setTimeout(() => setWaited(true), 800);

    return () => {
      clearTimeout(startTimeout);
      clearTimeout(readyTimeout);
    };
  }, []);

  return {
    hasMounted,
    hasStarted,
    hasWaited,
  };
};

export default useMounted;
