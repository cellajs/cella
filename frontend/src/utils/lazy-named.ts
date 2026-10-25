import { type ComponentType, type LazyExoticComponent, lazy } from 'react';

// biome-ignore lint/suspicious/noExplicitAny: the constraint only; each call keeps its component's own props.
export function lazyNamed<TModule extends Record<TKey, ComponentType<any>>, TKey extends keyof TModule>(
  loader: () => Promise<TModule>,
  exportName: TKey,
): LazyExoticComponent<TModule[TKey]> {
  return lazy(async () => ({ default: (await loader())[exportName] }));
}
