import {
  type BackoffOptions,
  type ChangeMessage,
  type ExternalParamsRecord,
  FetchError,
  type Row,
} from '@electric-sql/client';
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
    updateData: messages
      .filter((m) => m.headers.operation === 'update')
      .map((message) => parseRawData<Partial<T> & { id: string }>(message.value)),
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

export const handleSyncError = (
  error: Error,
  storePrefix: string,
  params: ExternalParamsRecord<Row<never>> | undefined,
) => {
  if (error instanceof FetchError && error.json) {
    const responseJson = error.json;

    if ('errors' in responseJson) {
      const syncErrors = responseJson.errors ?? {};
      const syncErrorKeys = Object.keys(syncErrors);

      // Check for internal stream sync errors (like offset or handle mismatches)
      const hasStreamError = syncErrorKeys.some((key) => key === 'offset' || key === 'handle');

      if (hasStreamError) {
        const relatedKeys = useSyncStore.getState().getKeysByPrefix(storePrefix);

        if (relatedKeys.length) {
          for (const key of relatedKeys) useSyncStore.getState().removeSyncData(key);
          console.info('[Sync] Cleared stale local sync data for prefix:', storePrefix);
        }

        return { params }; // Retry with original params
      }

      console.error('[Sync] Unexpected fetch sync error from server:', error);
      return;
    }

    const message = error.message ?? 'Unknown error during sync';

    console.warn(message);
    return;
  }

  // Fallback for unknown or unexpected errors
  console.error('[Sync] Unhandled error. Sync stopped.', error);
  return;
};
