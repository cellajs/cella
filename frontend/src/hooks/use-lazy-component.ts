import { type ComponentType, type LazyExoticComponent, useEffect, useState } from 'react';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { lazyNamed } from '~/utils/lazy-named';

/** Lazily loads `exportName` from a dynamic import `delay` ms after mount, through the latest render's `loader`; null until then. */
export function useLazyComponent<
  // biome-ignore lint/suspicious/noExplicitAny: the constraint only; each call keeps its component's own props.
  TModule extends Record<TKey, ComponentType<any>>,
  TKey extends keyof TModule,
>(loader: () => Promise<TModule>, exportName: TKey, delay: number): LazyExoticComponent<TModule[TKey]> | null {
  const [Component, setComponent] = useState<LazyExoticComponent<TModule[TKey]> | null>(null);
  const loaderRef = useLatestRef(loader);

  useEffect(() => {
    const timer = setTimeout(() => setComponent(lazyNamed(loaderRef.current, exportName)), delay);
    return () => clearTimeout(timer);
  }, [delay, exportName]);

  return Component;
}
