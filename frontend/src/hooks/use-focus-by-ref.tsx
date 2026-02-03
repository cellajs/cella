import { useEffect, useRef } from 'react';

interface UseFocusByRefOptions {
  /** When provided, focuses the element when trigger becomes true */
  trigger?: boolean;
  /** Delay in ms before focusing (useful for animations) */
  delay?: number;
}

/**
 * Hook to provide focus control for an element.
 * Focus is only set if window width is >= 640px.
 * Without options: focuses on mount.
 * With trigger: focuses when trigger becomes true.
 */
function useFocusByRef(options?: UseFocusByRefOptions) {
  const { trigger, delay = 0 } = options ?? {};
  const focusRef = useRef<HTMLInputElement | null>(null);

  const setFocus = () => {
    if (focusRef.current && window.innerWidth >= 640) {
      focusRef.current.focus();
    }
  };

  useEffect(() => {
    if (trigger === undefined) {
      // Original behavior: focus on mount
      if (window.innerWidth >= 640) setFocus();
    } else if (trigger) {
      // Focus when trigger becomes true
      if (delay) {
        const timer = setTimeout(setFocus, delay);
        return () => clearTimeout(timer);
      }
      setFocus();
    }
  }, [trigger, delay]);

  return { focusRef, setFocus };
}

export default useFocusByRef;
