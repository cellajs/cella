import type { ProductEntityType } from 'shared';
import { asRecord } from 'shared/utils/as-record';

/** Per type, the columns its update operation derives from the description, those only the server computes included. */
const descriptionColumns = new Map<string, readonly string[]>();

/**
 * Call at module load, in the entity's query.ts. The cache takes these columns only from a server write of the
 * description, as it takes the description, and a description write's answer brings them (`mergeServerResponse`).
 */
export function registerDescriptionColumns(entityType: ProductEntityType, columns: readonly string[]): void {
  descriptionColumns.set(entityType, columns);
}

/**
 * The type's Yjs-owned fields: the description and its registered columns. Rows name their type as a runtime string.
 * An app's test reads its registration here.
 * @public
 */
export function getYjsOwnedFields(entityType: string): string[] {
  return ['description', ...(descriptionColumns.get(entityType) ?? [])];
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
  for (const field of getYjsOwnedFields(entityType)) {
    const stamp = yjsFieldStamp(incoming, field);
    const unwritten = stamp === yjsFieldStamp(cached, field) && (stamp !== undefined || bothCarryStx);
    if (unwritten && field in cached) asRecord(guarded)[field] = asRecord(cached)[field];
  }
  return guarded;
}
