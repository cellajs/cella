import { type BackoffOptions, type ChangeMessage, type ExternalParamsRecord, FetchError, type Row } from '@electric-sql/client';
import type { ClientErrorStatusCode, ServerErrorStatusCode } from 'hono/utils/http-status';
import { ApiError } from '~/lib/api';
import { toaster } from '~/modules/common/toaster';
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

export const electricOnError = (error: Error, storePrefix: string, params: ExternalParamsRecord<Row<never>> | undefined) => {
  // Handle backend error response
  if (error instanceof FetchError && error.json) {
    const status = error.status as ClientErrorStatusCode | ServerErrorStatusCode;

    // Safely rehydrate API error
    const apiErr = new ApiError({ name: error.name, status, message: error.message ?? 'Unknown Fetch error', ...error.json });

    const message = typeof apiErr.meta?.toastMessage === 'string' ? apiErr.meta.toastMessage : `Attachment sync failed: ${apiErr.message}`;

    toaster(message, 'warning');
    return;
  }

  // Handle stream-related internal sync errors
  if (error.message.includes('offset') || error.message.includes('handle')) {
    const staleKeys = useSyncStore.getState().getKeysByPrefix(storePrefix);

    if (staleKeys.length) {
      for (const key of staleKeys) useSyncStore.getState().removeSyncData(key);
      console.info('Sync stale data cleared.');
    }

    return { params }; // Retry
  }

  // Fallback for unrecognized errors
  console.warn('Unhandled sync error. Stopping ShapeStream.', error);
  return;
};
