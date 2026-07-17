import { useCallback, useEffect, useRef } from 'react';
import type { ProductEntityType } from 'shared';
import { useSeenStore } from '~/modules/seen/seen-store';

type SeenMeta = {
  tenantId: string;
  organizationId: string;
  channelId: string;
  entityType: ProductEntityType;
  entityId: string;
};

const elementMeta = new WeakMap<Element, SeenMeta>();
const markedIds = new Set<string>();

// Seed IDs persisted by the seen store.
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

          if (markedIds.has(meta.entityId)) {
            sharedObserver?.unobserve(entry.target);
            continue;
          }

          console.debug('[SeenMark] intersected:', meta.entityType, meta.entityId.slice(0, 8));

          try {
            markEntitySeen(meta.tenantId, meta.organizationId, meta.channelId, meta.entityType, meta.entityId);
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
  /** Organization ID for the POST API route. */
  organizationId: string;
  /** Parent channel entity ID for badge grouping (e.g., projectId for tasks). Defaults to organizationId. */
  channelId?: string;
  entityType: ProductEntityType;
}

/**
 * Invisible zero-size marker that marks an entity row seen when it enters the viewport. Drop into any
 * cell (e.g. name column). A shared singleton IntersectionObserver supports hundreds of instances.
 *
 * @example
 * ```tsx
 * // In a column's renderCell (attachment: organizationId is the badge context):
 * <SeenMark entityId={row.id} tenantId={tenantId} organizationId={organizationId} entityType="attachment" />
 *
 * // Task badge groups by project, so pass channelId:
 * <SeenMark entityId={task.id} tenantId={task.tenantId} organizationId={task.organizationId} channelId={task.projectId} entityType="task" />
 * ```
 */
export function SeenMark({ entityId, tenantId, organizationId, channelId, entityType }: SeenMarkProps) {
  const resolvedChannelId = channelId ?? organizationId;
  const elementRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    retainObserver();
    return () => releaseObserver();
  }, []);

  const refCallback = useCallback(
    (node: HTMLSpanElement | null) => {
      if (elementRef.current) {
        elementMeta.delete(elementRef.current);
        sharedObserver?.unobserve(elementRef.current);
      }

      elementRef.current = node;

      if (node && !markedIds.has(entityId)) {
        elementMeta.set(node, { tenantId, organizationId, channelId: resolvedChannelId, entityType, entityId });
        getSharedObserver().observe(node);
      }
    },
    [entityId, tenantId, organizationId, resolvedChannelId, entityType],
  );

  // Already seen this session.
  if (markedIds.has(entityId)) return null;

  // Invisible overlay that inherits parent cell dimensions for intersection detection
  return (
    <span ref={refCallback} data-entity-id={entityId} aria-hidden className="pointer-events-none absolute inset-0" />
  );
}
