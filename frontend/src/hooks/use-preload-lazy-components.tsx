import type { ComponentType, LazyExoticComponent } from 'react';
import { useEffect } from 'react';

// biome-ignore lint/suspicious/noExplicitAny: Any component can be preloaded
export function usePreloadLazyComponents(components: LazyExoticComponent<ComponentType<any>>[]) {
  useEffect(() => {
    for (const lazyComponent of components) {
      // React.lazy keeps the loader in _payload/_init; calling _init starts the import without rendering.
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
