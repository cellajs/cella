import { useCallback, useEffect, useRef } from 'react';

/**
 * Hook to provide focus control for an element.
 * Focus is only set on mount if window width is greater than 700px.
 *
 * @returns A ref to attach to an element and a function to manually re-trigger focus.
 */
const useFocusByRef = () => {
  const focusRef = useRef<HTMLInputElement | null>(null);

  const setFocus = useCallback(() => {
    if (focusRef.current) {
      focusRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (window.innerWidth >= 640) setFocus();
  }, [setFocus]);

  return { focusRef, setFocus };
};

export default useFocusByRef;
