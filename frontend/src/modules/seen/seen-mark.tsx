import { useCallback, useEffect, useRef } from 'react';
import type { ProductEntityType } from 'shared';
import { useSeenStore } from '~/store/seen';

/**
 * Shared singleton IntersectionObserver for all SeenMark instances.
 *
 * One observer handles all entity rows across the page. When an element
 * enters the viewport (≥50%), its entity ID is marked as seen in the store
 * and the element is unobserved. This works seamlessly with virtualized
 * tables — rows register on mount and unregister on unmount, so recycled
 * DOM nodes are handled correctly.
 */

type SeenMeta = { tenantId: string; orgId: string; contextId: string; entityType: ProductEntityType; entityId: string };

const elementMeta = new WeakMap<Element, SeenMeta>();
const markedIds = new Set<string>();

// Pre-populate with IDs successfully flushed in previous sessions (persisted in Zustand store)
for (const id of useSeenStore.getState().flushedIds) markedIds.add(id);

let sharedObserver: IntersectionObserver | null = null;
let observerRefCount = 0;

function getSharedObserver(): IntersectionObserver {
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        const markEntitySeen = useSeenStore.getState().markEntitySeen;

        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          const meta = elementMeta.get(entry.target);
          if (!meta) continue;

          // Skip if already marked this session
          if (markedIds.has(meta.entityId)) {
            sharedObserver?.unobserve(entry.target);
            continue;
          }

          console.debug('[SeenMark] intersected:', meta.entityType, meta.entityId.slice(0, 8));

          try {
            markEntitySeen(meta.tenantId, meta.orgId, meta.contextId, meta.entityType, meta.entityId);
          } catch (err) {
            console.error('[SeenMark] markEntitySeen threw:', err);
          }
          markedIds.add(meta.entityId);
          sharedObserver?.unobserve(entry.target);
        }
      },
      { root: null, threshold: 0 },
    );
  }
  return sharedObserver;
}

function retainObserver() {
  observerRefCount++;
  return getSharedObserver();
}

function releaseObserver() {
  observerRefCount--;
  if (observerRefCount <= 0 && sharedObserver) {
    sharedObserver.disconnect();
    sharedObserver = null;
    observerRefCount = 0;
  }
}

interface SeenMarkProps {
  entityId: string;
  tenantId: string;
  /** Organization ID — used for the POST API route */
  orgId: string;
  /** Parent context entity ID for badge grouping (e.g., projectId for tasks). Defaults to orgId. */
  contextId?: string;
  entityType: ProductEntityType;
}

/**
 * Invisible zero-size marker component that tracks when an entity row
 * enters the viewport. Drop into any cell (e.g., name column) to
 * automatically mark the entity as seen.
 *
 * Uses a shared singleton IntersectionObserver — safe to render hundreds
 * of instances without performance impact.
 *
 * @example
 * ```tsx
 * // In a column's renderCell (attachment — orgId is the badge context):
 * <SeenMark entityId={row.id} tenantId={tenantId} orgId={orgId} entityType="attachment" />
 *
 * // Task — badge groups by project, so pass contextId:
 * <SeenMark entityId={task.id} tenantId={task.tenantId} orgId={task.organizationId} contextId={task.projectId} entityType="task" />
 * ```
 */
export function SeenMark({ entityId, tenantId, orgId, contextId, entityType }: SeenMarkProps) {
  const resolvedContextId = contextId ?? orgId;
  const elementRef = useRef<HTMLSpanElement>(null);

  // Retain/release the shared observer with component lifecycle
  useEffect(() => {
    retainObserver();
    return () => releaseObserver();
  }, []);

  // Register/unregister the element with the observer
  const refCallback = useCallback(
    (node: HTMLSpanElement | null) => {
      // Clean up previous element
      if (elementRef.current) {
        elementMeta.delete(elementRef.current);
        sharedObserver?.unobserve(elementRef.current);
      }

      elementRef.current = node;

      if (node && !markedIds.has(entityId)) {
        elementMeta.set(node, { tenantId, orgId, contextId: resolvedContextId, entityType, entityId });
        getSharedObserver().observe(node);
      }
    },
    [entityId, tenantId, orgId, resolvedContextId, entityType],
  );

  // Already seen this session — render nothing
  if (markedIds.has(entityId)) return null;

  // Invisible overlay that inherits parent cell dimensions for intersection detection
  return (
    <span ref={refCallback} data-entity-id={entityId} aria-hidden className="absolute inset-0 pointer-events-none" />
  );
}
