import { useEffect, useState } from 'react';

interface UseHasScrolledOptions {
  /** Delay in ms before the hook starts listening for scroll events. Default: 2000 */
  delay?: number;
  /** If true, starts listening immediately without delay. Default: false */
  immediate?: boolean;
}

/**
 * Hook to track if the user has scrolled the page.
 * Returns true after the first scroll event and stays true.
 * By default, waits 2 seconds before activating to prevent false positives on page load.
 */
export const useHasScrolled = ({ delay = 2000, immediate = false }: UseHasScrolledOptions = {}) => {
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    if (hasScrolled) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const handleScroll = () => {
      setHasScrolled(true);
      window.removeEventListener('scroll', handleScroll);
    };

    const startListening = () => {
      window.addEventListener('scroll', handleScroll, { passive: true });
    };

    if (immediate) {
      startListening();
    } else {
      timer = setTimeout(startListening, delay);
    }

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [delay, immediate, hasScrolled]);

  return hasScrolled;
};
