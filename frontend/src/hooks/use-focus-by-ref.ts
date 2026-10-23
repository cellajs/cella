import { useEffect, useRef } from 'react';
import { isTouchInteraction } from '~/utils/input-modality';

interface UseFocusByRefOptions {
  /** When provided, focuses the element when trigger becomes true */
  trigger?: boolean;
  /** Delay in ms before focusing. */
  delay?: number;
}

/** Focuses an input ref on mount or when `trigger` flips true, unless the latest input was touch. */
export function useFocusByRef({ trigger, delay = 0 }: UseFocusByRefOptions = {}) {
  const focusRef = useRef<HTMLInputElement | null>(null);

  const setFocus = () => {
    if (focusRef.current && !isTouchInteraction()) {
      focusRef.current.focus();
    }
  };

  useEffect(() => {
    if (trigger === undefined) {
      setFocus();
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
