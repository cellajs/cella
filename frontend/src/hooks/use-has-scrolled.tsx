import { useEffect, useState } from 'react';

interface UseHasScrolledOptions {
  /** Delay in ms before the hook starts listening for scroll events. Default: 2000 */
  delay?: number;
  /** If true, starts listening immediately without delay. Default: false */
  immediate?: boolean;
}

// Keys that typically trigger scrolling
const SCROLL_KEYS = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];

/**
 * True once the user initiates a scroll (via wheel/touch/keyboard, so it works with any scroll
 * container), and stays true. Waits 2s before activating to avoid false positives on page load.
 */
export const useHasScrolled = ({ delay = 2000, immediate = false }: UseHasScrolledOptions = {}) => {
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    if (hasScrolled) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const handleScrollIntent = () => {
      setHasScrolled(true);
      cleanup();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.includes(e.key)) {
        handleScrollIntent();
      }
    };

    const cleanup = () => {
      document.removeEventListener('wheel', handleScrollIntent);
      document.removeEventListener('touchmove', handleScrollIntent);
      document.removeEventListener('keydown', handleKeyDown);
    };

    const startListening = () => {
      document.addEventListener('wheel', handleScrollIntent, { passive: true });
      document.addEventListener('touchmove', handleScrollIntent, { passive: true });
      document.addEventListener('keydown', handleKeyDown, { passive: true });
    };

    if (immediate) {
      startListening();
    } else {
      timer = setTimeout(startListening, delay);
    }

    return () => {
      if (timer) clearTimeout(timer);
      cleanup();
    };
  }, [delay, immediate, hasScrolled]);

  return hasScrolled;
};
