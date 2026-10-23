import type { DehydratedState } from '@tanstack/react-query';
import { isChannel, isProduct, type ProductEntityType } from 'shared';
import { type LensEntityType, migrateCachedEntity, migrateQueuedMutation } from 'shared/schema-evolution';
import { asRecord, isRecord } from 'shared/utils/as-record';

/** The first item of a query or mutation key, which names the entity type of an entity key. */
const keyHead = (key: unknown): string | undefined => (Array.isArray(key) && typeof key[0] === 'string' ? key[0] : undefined);

/** The product entity type a query or mutation key starts with, or undefined. */
export function productTypeOf(key: unknown): ProductEntityType | undefined {
  const head = keyHead(key);
  return isProduct(head) ? head : undefined;
}

/** The lens entity type (product or channel) a query or mutation key starts with, or null. */
export function entityTypeOf(key: unknown): LensEntityType | null {
  const head = keyHead(key);
  return isProduct(head) || isChannel(head) ? head : null;
}

/** Walks single entity, array, `{ items }`, `{ data }`, and infinite `{ pages }` shapes, migrating each entity-like leaf. */
async function migrateData(entityType: LensEntityType, data: unknown, fromVersion: number): Promise<unknown> {
  if (Array.isArray(data)) {
    return Promise.all(data.map((item) => migrateData(entityType, item, fromVersion)));
  }
  if (isRecord(data)) {
    if (Array.isArray(data.pages)) {
      const pages = await Promise.all(data.pages.map((page) => migrateData(entityType, page, fromVersion)));
      return { ...data, pages };
    }
    if (Array.isArray(data.items)) {
      const items = await Promise.all(data.items.map((item) => migrateData(entityType, item, fromVersion)));
      return { ...data, items };
    }
    if (Array.isArray(data.data)) {
      const inner = await Promise.all(data.data.map((item) => migrateData(entityType, item, fromVersion)));
      return { ...data, data: inner };
    }
    if ('id' in data) return migrateCachedEntity(entityType, data, fromVersion);
  }
  return data;
}

/** Brings a dehydrated query's `state.data` up to the bundle's schema through the lens engine, so a store behind it needs no refetch. */
export async function migrateQueryState<S extends { data?: unknown }>(entityType: LensEntityType, state: S, fromVersion: number): Promise<S> {
  if (state.data === undefined) return state;
  const data = await migrateData(entityType, state.data, fromVersion);
  return { ...state, data };
}

/** Brings queued mutation variables up to the bundle's schema through the lens engine; the entity type comes from the mutation key. */
export function migrateMutations(mutations: DehydratedState['mutations'], fromVersion: number): DehydratedState['mutations'] {
  return mutations.map((mutation) => {
    const entityType = entityTypeOf(mutation.mutationKey);
    const variables = mutation.state?.variables;
    if (!entityType || variables == null || typeof variables !== 'object') return mutation;
    const migrated = migrateQueuedMutation(entityType, asRecord(variables), fromVersion);
    return { ...mutation, state: { ...mutation.state, variables: migrated } };
  });
}
