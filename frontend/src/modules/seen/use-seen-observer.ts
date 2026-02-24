import { useEffect, useRef } from 'react';
import type { ProductEntityType } from 'shared';
import { useSeenStore } from '~/store/seen';

interface UseSeenObserverOptions {
  tenantId: string;
  orgId: string;
  entityType: ProductEntityType;
  /** Entity IDs to track — observer fires when these DOM elements enter the viewport */
  entityIds?: string[];
  /** Whether to enable observation. Defaults to true. */
  enabled?: boolean;
}

/**
 * Hook that uses IntersectionObserver to track which entities the user has seen
 * in a list/table. When an entity row enters the viewport, it's marked as seen
 * in the seen store and queued for the next batch flush.
 *
 * Usage: attach `data-entity-id` attributes to list item DOM elements, then
 * pass the container ref to this hook.
 *
 * @example
 * ```tsx
 * const containerRef = useSeenObserver({
 *   tenantId: '...',
 *   orgId: '...',
 *   entityType: 'attachment',
 * });
 *
 * return (
 *   <div ref={containerRef}>
 *     {items.map(item => (
 *       <div key={item.id} data-entity-id={item.id}>{item.name}</div>
 *     ))}
 *   </div>
 * );
 * ```
 */
export function useSeenObserver({ tenantId, orgId, entityType, enabled = true }: UseSeenObserverOptions) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const markEntitySeen = useSeenStore.getState().markEntitySeen;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          const entityId = (entry.target as HTMLElement).dataset.entityId;
          if (entityId) {
            markEntitySeen(tenantId, orgId, entityType, entityId);
            // Stop observing once seen
            observer.unobserve(entry.target);
          }
        }
      },
      {
        root: null, // viewport
        threshold: 0.5, // At least 50% visible
      },
    );

    // Observe all elements with data-entity-id within the container
    const elements = containerRef.current.querySelectorAll('[data-entity-id]');
    for (const el of elements) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [tenantId, orgId, entityType, enabled]);

  return containerRef;
}
