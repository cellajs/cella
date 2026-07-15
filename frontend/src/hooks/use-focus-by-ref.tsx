import { useEffect, useRef } from 'react';

interface UseFocusByRefOptions {
  /** When provided, focuses the element when trigger becomes true */
  trigger?: boolean;
  /** Delay in ms before focusing (useful for animations) */
  delay?: number;
}

/**
 * Focus control for an input ref: focuses on mount, or when `trigger` flips true.
 * Only focuses when viewport width >= 640px.
 */
export function useFocusByRef(options?: UseFocusByRefOptions) {
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
