import { useEffect, useRef } from 'react';

interface UseFocusByRefOptions {
  /** When provided, focuses the element when trigger becomes true */
  trigger?: boolean;
  /** Delay in ms before focusing. */
  delay?: number;
}

/** Focuses an input ref on mount or when `trigger` flips true, only at viewport width >= 640px. */
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
      if (window.innerWidth >= 640) setFocus();
    } else if (trigger) {
      if (delay) {
        const timer = setTimeout(setFocus, delay);
        return () => clearTimeout(timer);
      }
      setFocus();
    }
  }, [trigger, delay]);

  return { focusRef, setFocus };
}
