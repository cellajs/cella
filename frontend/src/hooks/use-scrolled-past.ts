import { useEffect, useState } from 'react';

/** True while the window is scrolled past `offset` px. Re-renders only when the threshold is crossed, not per scroll frame. */
export const useScrolledPast = (offset: number, enabled = true) => {
  const [isPast, setIsPast] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsPast(false);
      return;
    }

    // Same-value updates bail out, so the handler can run on every scroll event
    const update = () => setIsPast(window.scrollY > offset);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [offset, enabled]);

  return isPast;
};
