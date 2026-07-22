import { useEffect, useRef, useState } from 'react';

/** Track immediate mount plus the 200 ms `hasStarted` and 800 ms `hasWaited` stages. */
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
