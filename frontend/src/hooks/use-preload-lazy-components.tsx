import type { ComponentType, LazyExoticComponent } from 'react';
import { useEffect } from 'react';

/** Preloads React.lazy components on mount by triggering their dynamic imports. */
// biome-ignore lint/suspicious/noExplicitAny: Any component can be preloaded
export function usePreloadLazyComponents(components: LazyExoticComponent<ComponentType<any>>[]) {
  useEffect(() => {
    for (const lazyComponent of components) {
      // React.lazy stores the loader in _payload and _init
      // Calling _init triggers the import without rendering
      if ('_payload' in lazyComponent && '_init' in lazyComponent) {
        try {
          (lazyComponent as { _init: (payload: unknown) => void; _payload: unknown })._init(
            (lazyComponent as { _payload: unknown })._payload,
          );
        } catch {
          // Errors are expected for unresolved promises - component will load when rendered
        }
      }
    }
  }, [components]);
}
