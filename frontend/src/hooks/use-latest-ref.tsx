import { useCallback, useLayoutEffect, useRef } from 'react';

/** Returns a ref that always contains the latest value. Useful for callbacks in effects. */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

type AnyFunction = (...args: unknown[]) => unknown;

/**
 * Returns a stable callback that always calls the latest function.
 * Useful for event handlers passed to memoized children or effects with changing deps.
 */
export function useLatestCallback<T extends AnyFunction | undefined | null>(fn: T): T {
  const ref = useRef(fn);

  useLayoutEffect(() => {
    ref.current = fn;
  });

  const stableCallback = useCallback((...args: Parameters<NonNullable<T>>) => {
    return ref.current?.(...args);
  }, []);

  // Return null/undefined if fn is nullish, otherwise return stable callback
  return (fn ? stableCallback : fn) as T;
}
