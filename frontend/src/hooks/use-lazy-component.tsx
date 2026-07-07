import { type ComponentType, type LazyExoticComponent, lazy, useEffect, useRef, useState } from 'react';

/**
 * Lazily loads a component after a specified delay.
 *
 * @param importFunc - Function returning a promise for the component.
 * @param delay - Delay in milliseconds before loading.
 * @returns Lazily loaded component.
 */
export function useLazyComponent<
  // biome-ignore lint/suspicious/noExplicitAny: Supports components with any prop shape.
  T extends ComponentType<any>,
  TModule extends Record<TKey, T>,
  TKey extends keyof TModule,
>(importFunc: () => Promise<TModule>, exportName: TKey, delay: number): LazyExoticComponent<T> | null {
  const [Component, setComponent] = useState<LazyExoticComponent<T> | null>(null);
  const importRef = useRef(importFunc);

  useEffect(() => {
    const timer = setTimeout(() => {
      importRef.current().then((module) => {
        setComponent(lazy(() => Promise.resolve({ default: module[exportName] })));
      });
    }, delay);

    return () => clearTimeout(timer);
  }, [delay, exportName]);

  return Component;
}
