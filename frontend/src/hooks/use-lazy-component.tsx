import { type ComponentType, type LazyExoticComponent, lazy, useEffect, useRef, useState } from 'react';

/**
 * Lazily loads a component after a specified delay.
 *
 * @param importFunc - Function returning a promise for the component.
 * @param delay - Delay in milliseconds before loading.
 * @returns Lazily loaded component.
 */
// biome-ignore lint/suspicious/noExplicitAny: Any component can be included
export function useLazyComponent<T extends ComponentType<any>>(
  importFunc: () => Promise<{ default: T }>,
  delay: number,
): LazyExoticComponent<T> | null {
  const [Component, setComponent] = useState<LazyExoticComponent<T> | null>(null);
  const importRef = useRef(importFunc);

  useEffect(() => {
    const timer = setTimeout(() => {
      importRef.current().then((module) => {
        setComponent(lazy(() => Promise.resolve(module)));
      });
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  return Component;
}
