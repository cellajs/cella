import { useEffect, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';

type UseDebounceOptions<T> = {
  /** Value that bypasses debounce and applies immediately (e.g., `false` for loading states). */
  immediateValue?: T;
};

/**
 * Debounces a value by `delay`. `options.immediateValue` bypasses the debounce and applies
 * instantly when the value matches it. This can delay showing a spinner while hiding it at once.
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
