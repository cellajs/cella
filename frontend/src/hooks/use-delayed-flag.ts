import { useEffect, useState } from 'react';

/** True once `active` has held for `ms`: false on the first render, and false in the same render that `active` ends. */
export function useDelayedFlag(active: boolean, ms: number) {
  const [held, setHeld] = useState(false);
  // Reset during render, so the next activation waits the full delay again
  if (!active && held) setHeld(false);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setHeld(true), ms);
    return () => clearTimeout(timer);
  }, [active, ms]);

  return active && held;
}
