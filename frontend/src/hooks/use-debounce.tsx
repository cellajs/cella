import { debounce } from '@github/mini-throttle';
import { useCallback, useEffect, useState } from 'react';

/**
 * Custom hook that debounces a value by a specified delay.
 *
 * @param value - Value to debounce.
 * @param delay - Debounce delay in milliseconds (default: 1000ms).
 * @returns Debounced value.
 */
export function useDebounce<T>(value: T, delay = 1000): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const debounceFn = useCallback(debounce(setDebouncedValue, delay), [delay]);

  useEffect(() => {
    debounceFn(value);
    return () => debounceFn.cancel?.(); // Cancel any pending execution on unmount
  }, [value, debounceFn]);

  return debouncedValue;
}
