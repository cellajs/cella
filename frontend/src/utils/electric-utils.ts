import { type BackoffOptions, type ExternalParamsRecord, FetchError, type Row } from '@electric-sql/client';
import type { ClientErrorStatusCode, ServerErrorStatusCode } from 'hono/utils/http-status';
import { ApiError } from '~/lib/api';
import { toaster } from '~/modules/common/toaster/service';
import { useSyncStore } from '~/store/sync';

/**
 * Base backoff Options for shape-streams
 */
export const baseBackoffOptions: BackoffOptions = {
  initialDelay: 500,
  maxDelay: 32000,
  multiplier: 2,
};

export const handleSyncError = (error: Error, storePrefix: string, params: ExternalParamsRecord<Row<never>> | undefined) => {
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

    // Handle generic backend sync error response
    const status = error.status as ClientErrorStatusCode | ServerErrorStatusCode;

    const apiError = new ApiError({ name: error.name, status, message: error.message ?? 'Unknown error during sync', ...responseJson });

    const toastMsg = typeof apiError.meta?.toastMessage === 'string' ? apiError.meta.toastMessage : `Sync failed: ${apiError.message}`;

    toaster(toastMsg, 'warning');
    return;
  }

  // Fallback for unknown or unexpected errors
  console.error('[Sync] Unhandled error. Sync stopped.', error);
  return;
};
