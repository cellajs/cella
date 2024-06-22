import { type ComponentType, type LazyExoticComponent, lazy, useEffect, useState } from 'react';

// Load a component lazily and with a delay
// biome-ignore lint/suspicious/noExplicitAny: Any component can be included
function useLazyComponent<T extends ComponentType<any>>(importFunc: () => Promise<{ default: T }>, delay: number): LazyExoticComponent<T> | null {
  const [Component, setComponent] = useState<LazyExoticComponent<T> | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      importFunc().then((module) => {
        const LazyComponent = lazy(() => Promise.resolve(module));
        setComponent(LazyComponent);
      });
    }, delay);

    return () => clearTimeout(timer);
  }, [importFunc, delay]);

  return Component;
}

export default useLazyComponent;
