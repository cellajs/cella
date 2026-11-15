import { useSyncExternalStore } from 'react';

const subscribeToScroll = (onChange: () => void) => {
  window.addEventListener('scroll', onChange, { passive: true });
  return () => window.removeEventListener('scroll', onChange);
};

const subscribeToNothing = () => () => {};

/** True while the window is scrolled past `offset` px. Re-renders only when the threshold is crossed, not per scroll frame. */
export const useScrolledPast = (offset: number, enabled = true) =>
  useSyncExternalStore(enabled ? subscribeToScroll : subscribeToNothing, () => enabled && window.scrollY > offset);
