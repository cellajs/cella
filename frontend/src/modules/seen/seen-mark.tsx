import type { ProductEntityType } from 'shared';
import { type SeenMeta, seenStore } from '~/modules/seen/seen-store';

const elementMeta = new WeakMap<Element, SeenMeta>();
const markedIds = new Set<string>();

for (const id of seenStore.getState().flushedIds) markedIds.add(id);

let sharedObserver: IntersectionObserver | null = null;
let observerRefCount = 0;

function retainObserver() {
  observerRefCount++;
  sharedObserver ??= new IntersectionObserver(
    (entries) => {
      const markProductSeen = seenStore.getState().markProductSeen;

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
          markProductSeen(meta);
        } catch (error) {
          console.error('[SeenMark] markProductSeen threw:', error);
        }
        markedIds.add(meta.productId);
        sharedObserver?.unobserve(entry.target);
      }
    },
    { root: null, threshold: 0 },
  );
  return sharedObserver;
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
  /** Parent channel entity ID for badge grouping. Defaults to organizationId. */
  channelId?: string;
  productType: ProductEntityType;
}

/** Invisible viewport marker that records an entity as seen. All instances share one IntersectionObserver. */
export function SeenMark({ productId, tenantId, organizationId, channelId = organizationId, productType }: SeenMarkProps) {
  if (markedIds.has(productId)) return null;

  const observe = (node: HTMLSpanElement) => {
    elementMeta.set(node, { tenantId, organizationId, channelId, productType, productId });
    retainObserver().observe(node);
    return () => {
      elementMeta.delete(node);
      sharedObserver?.unobserve(node);
      releaseObserver();
    };
  };

  return <span ref={observe} data-entity-id={productId} aria-hidden className="pointer-events-none absolute inset-0" />;
}
