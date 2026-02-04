import { useEffect, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';

type UseDebounceOptions<T> = {
  /** Value that bypasses debounce and applies immediately (e.g., `false` for loading states). */
  immediateValue?: T;
};

/**
 * Custom hook that debounces a value by a specified delay.
 * Optionally, a specific value can bypass the debounce and apply instantly.
 *
 * @param value - Value to debounce.
 * @param delay - Debounce delay in milliseconds (default: 1000ms).
 * @param options - Options object with `immediateValue` to specify a value that applies immediately.
 * @returns Debounced value.
 *
 * @example
 * // Regular debounce for search input
 * const debouncedSearch = useDebounce(searchTerm, 300);
 *
 * @example
 * // Loading state: delay showing spinner, hide instantly
 * const isLoading = useDebounce(isLoadingRaw, 200, { immediateValue: false });
 */
export function useDebounce<T>(value: T, delay = 1000, options?: UseDebounceOptions<T>): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  const debouncedSet = useDebouncedCallback((val: T) => {
    setDebouncedValue(val);
  }, delay);

  useEffect(() => {
    // If immediateValue is set and value matches, cancel pending and apply immediately
    if (options?.immediateValue !== undefined && value === options.immediateValue) {
      debouncedSet.cancel();
      setDebouncedValue(value);
      return;
    }
    debouncedSet(value);
  }, [value, options?.immediateValue, debouncedSet]);

  return debouncedValue;
}
