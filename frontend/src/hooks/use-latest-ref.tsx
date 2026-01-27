import { useRef } from 'react';

/** Returns a ref that always contains the latest value. Useful for callbacks in effects. */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
