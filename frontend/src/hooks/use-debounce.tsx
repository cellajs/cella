import { useEffect, useState } from 'react';

type UseDebounceOptions<T> = {
  /** Value that bypasses debounce and applies immediately (e.g., `false` for loading states). */
  immediateValue?: T;
};

/** Debounces a value, applying `immediateValue` at once when the value matches it. */
export function useDebounce<T>(value: T, delay = 1000, options?: UseDebounceOptions<T>): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const immediateValue = options?.immediateValue;

  useEffect(() => {
    if (immediateValue !== undefined && value === immediateValue) {
      setDebouncedValue(value);
      return;
    }
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay, immediateValue]);

  return debouncedValue;
}
