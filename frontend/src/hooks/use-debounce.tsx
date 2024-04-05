import { debounce } from '@github/mini-throttle';
import { useCallback, useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delay = 1000): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const debounceFn = useCallback(debounce(setDebouncedValue, delay), []);

  useEffect(() => {
    debounceFn(value);
  }, [value, delay]);

  return debouncedValue;
}
