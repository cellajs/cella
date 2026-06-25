/**
 * Boot-time cache migration (Phase 1, runtime touch point 2).
 *
 * When the persisted schema ordinal is behind the running bundle, cached
 * product-entity rows and queued mutations are rewritten in place via the lens
 * engine — no refetch. Migrations are idempotent, so an interrupted pass is
 * safe to re-run. See info/SCHEMA_EVOLUTION.md (1.4, 1.5, 1.6).
 */
import type { DehydratedState } from '@tanstack/react-query';
import type { ProductEntityType } from 'shared';
import { appConfig } from 'shared';
import { migrateCachedEntity, migrateQueuedMutation } from 'shared/version-changes';

type AnyRecord = Record<string, unknown>;

const productEntitySet = new Set<string>(appConfig.productEntityTypes);

/** Returns the product entity type encoded in a query/mutation key, or null. */
export function entityTypeOf(key: unknown): ProductEntityType | null {
  const head = Array.isArray(key) ? key[0] : undefined;
  return typeof head === 'string' && productEntitySet.has(head) ? (head as ProductEntityType) : null;
}

function isEntityRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && 'id' in (value as AnyRecord);
}

/**
 * Walks the common React Query data shapes (single entity, array, `{ items }`,
 * `{ data }`, and infinite `{ pages }`) and migrates each entity-like leaf.
 */
async function migrateData(entityType: ProductEntityType, data: unknown, fromVersion: number): Promise<unknown> {
  if (Array.isArray(data)) {
    return Promise.all(data.map((item) => migrateData(entityType, item, fromVersion)));
  }
  if (data && typeof data === 'object') {
    const record = data as AnyRecord;
    if (Array.isArray(record.pages)) {
      const pages = await Promise.all(record.pages.map((page) => migrateData(entityType, page, fromVersion)));
      return { ...record, pages };
    }
    if (Array.isArray(record.items)) {
      const items = await Promise.all(record.items.map((item) => migrateData(entityType, item, fromVersion)));
      return { ...record, items };
    }
    if (Array.isArray(record.data)) {
      const inner = await Promise.all(record.data.map((item) => migrateData(entityType, item, fromVersion)));
      return { ...record, data: inner };
    }
    if (isEntityRecord(record)) {
      return migrateCachedEntity(entityType, record, fromVersion);
    }
  }
  return data;
}

/** Migrates a single dehydrated query's `state.data` for a product entity type. */
export async function migrateQueryState<S extends { data?: unknown }>(
  entityType: ProductEntityType,
  state: S,
  fromVersion: number,
): Promise<S> {
  if (state.data === undefined) return state;
  const data = await migrateData(entityType, state.data, fromVersion);
  return { ...state, data };
}

/** Migrates queued mutation variables forward. Entity type is inferred from the mutation key. */
export function migrateMutations(
  mutations: DehydratedState['mutations'],
  fromVersion: number,
): DehydratedState['mutations'] {
  return mutations.map((mutation) => {
    const entityType = entityTypeOf(mutation.mutationKey);
    const variables = mutation.state?.variables;
    if (!entityType || variables == null || typeof variables !== 'object') return mutation;
    const migrated = migrateQueuedMutation(entityType, variables as AnyRecord, fromVersion);
    return { ...mutation, state: { ...mutation.state, variables: migrated } };
  });
}
