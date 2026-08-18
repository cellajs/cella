import { useEffect, useState } from 'react';

interface UseHasScrolledOptions {
  /** Delay in ms before the hook starts listening for scroll events. Default: 2000 */
  delay?: number;
  /** If true, starts listening immediately without delay. Default: false */
  immediate?: boolean;
}

const SCROLL_KEYS = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];

/** True once the user scrolls with wheel, touch or keyboard, and stays true. Waits `delay` before listening. */
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
