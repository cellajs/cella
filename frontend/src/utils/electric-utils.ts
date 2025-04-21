import type { BackoffOptions, ChangeMessage } from '@electric-sql/client';
import { useSyncStore } from '~/store/sync';

// Convert camelCase to snake_case
type CamelToSnake<S extends string> = S extends `${infer First}${infer Rest}`
  ? `${Lowercase<First>}${Rest extends Uncapitalize<Rest> ? '' : '_'}${CamelToSnake<Rest>}`
  : S;

// Convert all object keys from camelCase to snake_case
export type CamelToSnakeObject<T> = {
  [K in keyof T as CamelToSnake<Extract<K, string>>]: T[K];
};

/**
 * Base backoff Options for shape-streams
 */
export const baseBackoffOptions: BackoffOptions = {
  initialDelay: 500,
  maxDelay: 32000,
  multiplier: 2,
};

/**
 * Converts messages
 */
export const processMessages = <T extends { id: string }>(messages: ChangeMessage<CamelToSnakeObject<T>>[]) => {
  return {
    insertData: messages.filter((m) => m.headers.operation === 'insert').map((message) => parseRawData(message.value)),
    updateData: messages.filter((m) => m.headers.operation === 'update').map((message) => parseRawData<Partial<T> & { id: string }>(message.value)),
    deleteIds: messages.filter((m) => m.headers.operation === 'delete').map(({ value }) => value.id),
  };
};

/**
 * Parses raw  data into passed type
 */
const parseRawData = <T>(rawData: CamelToSnakeObject<T>): T => {
  const attachment = {} as T;
  for (const key of Object.keys(rawData)) {
    const camelKey = snakeToCamel(key) as keyof T;
    attachment[camelKey] = rawData[key as keyof CamelToSnakeObject<T>] as never;
  }
  return attachment;
};

export const snakeToCamel = (str: string) => str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

export const errorHandler = (error: Error, storePrefix: string) => {
  // Check if the error message indicates an "offset" or "handle" issue
  if (error.message.includes('offset') || error.message.includes('handle')) {
    // Remove stale sync data related to this shape
    const staleKeys = useSyncStore.getState().getKeysByPrefix(storePrefix);
    if (!staleKeys.length) {
      console.warn('No stale data found. Stopping ShapeStream.');
      return false; // Stop syncing
    }
    for (const key of staleKeys) useSyncStore.getState().removeSyncData(key);

    console.info('Stale data cleared. Retrying sync...');
    return true; // Retry syncing
  }

  console.warn('Unhandled sync error. Stopping ShapeStream.');
  return false; // Stop syncing
};
