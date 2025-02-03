import { useEffect, useState } from 'react';

/**
 * Custom hook to track mounting stages of a component.
 *
 * @returns flags for:
 * - `hasMounted`: component mounted
 * - `hasStarted`: component started after 200ms
 * - `hasWaited`: component after 800ms
 */
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
