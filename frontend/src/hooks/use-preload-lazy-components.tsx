import { type ComponentType, type LazyExoticComponent, useEffect } from 'react';

/**
 * Starts a lazy component's import without rendering it; settles once it renders without suspending. A failed import
 * settles too: rendering the component then throws to its error boundary as usual.
 * @public
 */
// biome-ignore lint/suspicious/noExplicitAny: Any component can be preloaded
export async function preloadLazyComponent(lazyComponent: LazyExoticComponent<ComponentType<any>>): Promise<void> {
  // React.lazy keeps the loader in _payload/_init; _init throws the pending import, and marks the component resolved before
  // any later listener on that import runs.
  if (!('_payload' in lazyComponent && '_init' in lazyComponent)) return;
  const lazy = lazyComponent as { _init: (payload: unknown) => void; _payload: unknown };
  try {
    lazy._init(lazy._payload);
  } catch (pending) {
    await Promise.resolve(pending).catch(() => {});
  }
}

// biome-ignore lint/suspicious/noExplicitAny: Any component can be preloaded
export function usePreloadLazyComponents(components: LazyExoticComponent<ComponentType<any>>[]) {
  useEffect(() => {
    for (const lazyComponent of components) preloadLazyComponent(lazyComponent);
  }, [components]);
}
