import { useEffect, useRef, useState } from 'react';

/**
 * Custom hook to track mounting stages of a component.
 *
 * @returns flags for:
 * - `hasMounted`: component mounted (ref-based, no re-render)
 * - `hasStarted`: component started after 200ms
 * - `hasWaited`: component waited 800ms
 */
export const useMountedState = () => {
  const mountedRef = useRef(false);
  const [stage, setStage] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    mountedRef.current = true;

    const startTimeout = setTimeout(() => setStage(1), 200);
    const readyTimeout = setTimeout(() => setStage(2), 800);

    return () => {
      clearTimeout(startTimeout);
      clearTimeout(readyTimeout);
    };
  }, []);

  return {
    hasMounted: mountedRef.current,
    hasStarted: stage >= 1,
    hasWaited: stage >= 2,
  };
};
