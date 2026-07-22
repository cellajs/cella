import { useCallback, useEffect, useRef } from 'react';
import type { ProductEntityType } from 'shared';
import { useSeenStore } from '~/modules/seen/seen-store';

type SeenMeta = {
  tenantId: string;
  organizationId: string;
  channelId: string;
  productType: ProductEntityType;
  productId: string;
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
        const markProductSeen = useSeenStore.getState().markProductSeen;

        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          const meta = elementMeta.get(entry.target);
          if (!meta) continue;

          if (markedIds.has(meta.productId)) {
            sharedObserver?.unobserve(entry.target);
            continue;
          }

          console.debug('[SeenMark] intersected:', meta.productType, meta.productId.slice(0, 8));

          try {
            markProductSeen(meta.tenantId, meta.organizationId, meta.channelId, meta.productType, meta.productId);
          } catch (err) {
            console.error('[SeenMark] markProductSeen threw:', err);
          }
          markedIds.add(meta.productId);
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
  productId: string;
  tenantId: string;
  /** Organization ID for the POST API route. */
  organizationId: string;
  /** Parent channel entity ID for badge grouping (e.g., projectId for tasks). Defaults to organizationId. */
  channelId?: string;
  productType: ProductEntityType;
}

/**
 * Invisible viewport marker that records an entity as seen.
 * Instances share one observer; `channelId` overrides organization-level badge grouping.
 */
export function SeenMark({ productId, tenantId, organizationId, channelId, productType }: SeenMarkProps) {
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

      if (node && !markedIds.has(productId)) {
        elementMeta.set(node, { tenantId, organizationId, channelId: resolvedChannelId, productType, productId });
        getSharedObserver().observe(node);
      }
    },
    [productId, tenantId, organizationId, resolvedChannelId, productType],
  );

  // Already seen this session.
  if (markedIds.has(productId)) return null;

  // Invisible overlay that inherits parent cell dimensions for intersection detection
  return (
    <span ref={refCallback} data-entity-id={productId} aria-hidden className="pointer-events-none absolute inset-0" />
  );
}
