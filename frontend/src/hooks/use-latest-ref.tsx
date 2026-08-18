import { useCallback, useLayoutEffect, useRef } from 'react';

export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

// biome-ignore lint/suspicious/noExplicitAny: generic function type for useLatestCallback
type AnyFunction = (...args: any[]) => any;

/** Stable callback identity that always calls the latest `fn`; a nullish `fn` is returned unchanged. */
export function useLatestCallback<T extends AnyFunction | undefined | null>(fn: T): T {
  const ref = useRef(fn);

  useLayoutEffect(() => {
    ref.current = fn;
  });

  const stableCallback = useCallback((...args: Parameters<NonNullable<T>>) => {
    return ref.current?.(...args);
  }, []);

  return (fn ? stableCallback : fn) as T;
}
