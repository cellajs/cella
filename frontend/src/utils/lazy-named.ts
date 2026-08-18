import { type ComponentType, type LazyExoticComponent, lazy } from 'react';

// biome-ignore lint/suspicious/noExplicitAny: Supports lazy-loading components with any prop shape.
export function lazyNamed<T extends ComponentType<any>, TModule extends Record<TKey, T>, TKey extends keyof TModule>(
  loader: () => Promise<TModule>,
  exportName: TKey,
): LazyExoticComponent<T> {
  return lazy(async () => {
    const module = await loader();
    return { default: module[exportName] };
  });
}
