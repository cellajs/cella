import { type ComponentProps, type ComponentType, createElement, type LazyExoticComponent, lazy } from 'react';

// biome-ignore lint/suspicious/noExplicitAny: the constraint only; each call keeps its component's own props.
export const lazyNamed = <TModule extends Record<TKey, ComponentType<any>>, TKey extends keyof TModule>(
  loader: () => Promise<TModule>,
  exportName: TKey,
): LazyExoticComponent<TModule[TKey]> => lazy(async () => ({ default: (await loader())[exportName] }));

/**
 * `lazyNamed` with a `preload` a route loader awaits. Once loaded it renders the component itself: a lazy component
 * suspends once even then, and React holds back content whose Suspense fallback just showed for 300ms.
 */
// biome-ignore lint/suspicious/noExplicitAny: the constraint only; each call keeps its component's own props.
export const preloadableNamed = <TModule extends Record<TKey, ComponentType<any>>, TKey extends keyof TModule>(
  loader: () => Promise<TModule>,
  exportName: TKey,
) => {
  let loaded: TModule[TKey] | undefined;
  const preload = async () => {
    loaded ??= (await loader())[exportName];
    return loaded;
  };
  const Lazy = lazy(async () => ({ default: await preload() }));
  // biome-ignore lint/correctness/noComponentHookFactories: called once at module scope, as lazy() is, so the component keeps one identity
  const Preloadable = (props: ComponentProps<TModule[TKey]>) => createElement(loaded ?? Lazy, props);

  return Object.assign(Preloadable, { preload });
};
