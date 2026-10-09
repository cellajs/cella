import { appConfig } from 'shared';
import { log } from '../lib/pino';
import type { PendingEvent } from '../types';

/** Reverse lookup: hostProduct to the products embedded into it. */
const embeddedByHostProduct = new Map<string, Set<string>>();
for (const { embeddedProduct, hostProduct } of appConfig.productEmbeddings) {
  const embedded = embeddedByHostProduct.get(hostProduct) ?? new Set<string>();
  embedded.add(embeddedProduct);
  embeddedByHostProduct.set(hostProduct, embedded);
}

/**
 * Suppresses host-product updates that only propagate an embedded-product delete from the same
 * transaction; the client already applies these through propagateEmbeddings. It decides by type alone: every update
 * of a host type goes when the transaction holds a delete of a type embedded in it, whichever row and columns it changed.
 */
export function suppressSoftCascades(events: PendingEvent[]): PendingEvent[] {
  const deleteTypes = new Set<string>();
  for (const e of events) {
    if (e.result.activity.action === 'delete' && e.result.activity.entityType) {
      deleteTypes.add(e.result.activity.entityType);
    }
  }

  if (deleteTypes.size === 0) return events;

  let softSuppressedCount = 0;
  const kept: PendingEvent[] = [];

  for (const event of events) {
    const { activity } = event.result;
    if (activity.action === 'update' && activity.entityType) {
      const embeddedTypes = embeddedByHostProduct.get(activity.entityType);
      if (embeddedTypes && [...embeddedTypes].some((s) => deleteTypes.has(s))) {
        softSuppressedCount++;
        continue;
      }
    }
    kept.push(event);
  }

  if (softSuppressedCount > 0) {
    log.info('Suppressed soft cascade update events', { softSuppressedCount, deleteTypes: [...deleteTypes], survivingCount: kept.length });
  }

  return kept;
}
