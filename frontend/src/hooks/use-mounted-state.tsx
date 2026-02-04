import { useEffect, useState } from 'react';

/**
 * Custom hook to track mounting stages of a component.
 *
 * @returns flags for:
 * - `hasMounted`: component mounted
 * - `hasStarted`: component started after 200ms
 * - `hasWaited`: component waited 800ms
 * - `hasLoaded`: component loaded after 3000ms (for initial loading animations)
 */
export const useMountedState = () => {
  const [hasMounted, setMounted] = useState(false);
  const [hasStarted, setStarted] = useState(false);
  const [hasWaited, setWaited] = useState(false);
  const [hasLoaded, setLoaded] = useState(false);

  useEffect(() => {
    setMounted(true);

    const startTimeout = setTimeout(() => setStarted(true), 200);
    const readyTimeout = setTimeout(() => setWaited(true), 800);
    const loadedTimeout = setTimeout(() => setLoaded(true), 3000);

    return () => {
      clearTimeout(startTimeout);
      clearTimeout(readyTimeout);
      clearTimeout(loadedTimeout);
    };
  }, []);

  return {
    hasMounted,
    hasStarted,
    hasWaited,
    hasLoaded,
  };
};

export default useMountedState;
