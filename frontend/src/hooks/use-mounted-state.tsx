import { useEffect, useState } from 'react';

/** Track the 200 ms `hasStarted` and 800 ms `hasWaited` stages after mount. */
export const useMountedState = () => {
  const [stage, setStage] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    const startTimeout = setTimeout(() => setStage(1), 200);
    const readyTimeout = setTimeout(() => setStage(2), 800);

    return () => {
      clearTimeout(startTimeout);
      clearTimeout(readyTimeout);
    };
  }, []);

  return { hasStarted: stage >= 1, hasWaited: stage >= 2 };
};
