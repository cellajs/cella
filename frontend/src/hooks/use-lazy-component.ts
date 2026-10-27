import { type ComponentType, type LazyExoticComponent, useEffect, useEffectEvent, useState } from 'react';
import { lazyNamed } from '~/utils/lazy-named';

/** Lazily loads `exportName` from a dynamic import `delay` ms after mount, through the latest render's `loader`; null until then. */
export function useLazyComponent<
  // biome-ignore lint/suspicious/noExplicitAny: the constraint only, as `lazyNamed` writes it.
  TModule extends Record<TKey, ComponentType<any>>,
  TKey extends keyof TModule,
>(loader: () => Promise<TModule>, exportName: TKey, delay: number): LazyExoticComponent<TModule[TKey]> | null {
  const [Component, setComponent] = useState<LazyExoticComponent<TModule[TKey]> | null>(null);
  const load = useEffectEvent(() => lazyNamed(loader, exportName));

  useEffect(() => {
    const timer = setTimeout(() => setComponent(load()), delay);
    return () => clearTimeout(timer);
  }, [delay, exportName]);

  return Component;
}
