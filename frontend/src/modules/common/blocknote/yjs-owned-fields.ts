import type { ProductEntityType } from 'shared';
import { asRecord } from 'shared/utils/as-record';

/** Runtime registry of Yjs-owned fields: the description and the columns derived from it, which the cache takes only from a server write of them. */
const yjsOwnedFields = new Map<ProductEntityType, string[]>();

/** Call at module load, in the entity's query.ts. */
export function registerYjsOwnedFields(entityType: ProductEntityType, fields: string[]): void {
  yjsOwnedFields.set(entityType, fields);
}

/**
 * The type's registered fields; `description` alone for an unregistered type. An app's test reads its registration here.
 * @public
 */
export function getYjsOwnedFields(entityType: ProductEntityType): string[] {
  return yjsOwnedFields.get(entityType) ?? ['description'];
}

/** The stamp a Yjs-owned field is compared by: its own, else the description's, which derived columns follow. */
function yjsFieldStamp(row: object, field: string): string | undefined {
  const { stx } = asRecord(row) as { stx?: { fieldTimestamps?: Record<string, string> } };
  return stx?.fieldTimestamps?.[field] ?? stx?.fieldTimestamps?.description;
}

/** Whether a row carries sync metadata: in one that does, a field without a stamp was not written since the create. */
function hasStx(row: object): boolean {
  const { stx } = asRecord(row);
  return typeof stx === 'object' && stx !== null;
}

/**
 * The cache takes a Yjs-owned field only from a server write of it, which stamps the field anew. An incoming row that carries
 * the cached copy's stamp keeps the cached value, so a read that lags the relay cannot overwrite a collaborative patch. A
 * create stamps no field, so two rows that both carry `stx` and neither stamp count as unwritten too; a row without `stx`
 * applies. A server-side backfill of an owned field that stamps nothing reaches a client through a `clientCacheVersion` bump.
 */
export function guardYjsOwnedFields<T extends object>(entityType: string, incoming: T, cached: object | undefined): T {
  if (!cached) return incoming;
  const guarded = { ...incoming };
  const bothCarryStx = hasStx(incoming) && hasStx(cached);
  // Rows name their type as a runtime string; an unregistered type gets the default fields.
  for (const field of getYjsOwnedFields(entityType as ProductEntityType)) {
    const stamp = yjsFieldStamp(incoming, field);
    const unwritten = stamp === yjsFieldStamp(cached, field) && (stamp !== undefined || bothCarryStx);
    if (unwritten && field in cached) asRecord(guarded)[field] = asRecord(cached)[field];
  }
  return guarded;
}
