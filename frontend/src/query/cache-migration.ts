/**
 * Boot-time cache migration (Phase 1, runtime touch point 2).
 *
 * When the persisted schema ordinal is behind the running bundle, cached
 * entity rows (product per-query records + bundled context queries) and queued
 * mutations are rewritten in place via the lens engine, no refetch.
 * Migrations are idempotent, so an interrupted pass is safe to re-run.
 */
import type { DehydratedState } from '@tanstack/react-query';
import { appConfig } from 'shared';
import { type LensEntityType, migrateCachedEntity, migrateQueuedMutation } from 'shared/schema-evolution';

type AnyRecord = Record<string, unknown>;

const lensEntitySet = new Set<string>([...appConfig.productEntityTypes, ...appConfig.contextEntityTypes]);

/** Returns the lens-capable entity type (product or context) encoded in a query/mutation key, or null. */
export function entityTypeOf(key: unknown): LensEntityType | null {
  const head = Array.isArray(key) ? key[0] : undefined;
  return typeof head === 'string' && lensEntitySet.has(head) ? (head as LensEntityType) : null;
}

function isEntityRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && 'id' in (value as AnyRecord);
}

/**
 * Walks the common React Query data shapes (single entity, array, `{ items }`,
 * `{ data }`, and infinite `{ pages }`) and migrates each entity-like leaf.
 */
async function migrateData(entityType: LensEntityType, data: unknown, fromVersion: number): Promise<unknown> {
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

/** Migrates a single dehydrated query's `state.data` for a lens-capable entity type. */
export async function migrateQueryState<S extends { data?: unknown }>(
  entityType: LensEntityType,
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
