import { type BackoffOptions, FetchError } from '@electric-sql/client';
import type { ClientErrorStatusCode, ServerErrorStatusCode } from 'hono/utils/http-status';
import { ApiError } from '~/lib/api';
import { toaster } from '~/modules/common/toaster/service';

/**
 * Base backoff Options for shape-streams
 */
export const baseBackoffOptions: BackoffOptions = {
  initialDelay: 500,
  maxDelay: 32000,
  multiplier: 2,
};

/**
 * Handles sync errors from Electric shape-streams.
 */
export const handleSyncError = (error: Error) => {
  if (error instanceof FetchError && error.json) {
    const responseJson = error.json;

    if ('errors' in responseJson) {
      console.error('[Sync] Unexpected fetch sync error from server:', error);
      return;
    }

    // Handle generic backend sync error response
    const status = error.status as ClientErrorStatusCode | ServerErrorStatusCode;

    const apiError = new ApiError({
      name: error.name,
      status,
      message: error.message ?? 'Unknown error during sync',
      ...responseJson,
    });

    const toastMsg =
      typeof apiError.meta?.toastMessage === 'string' ? apiError.meta.toastMessage : `Sync failed: ${apiError.message}`;

    toaster(toastMsg, 'warning');
    return;
  }

  // Fallback for unknown or unexpected errors
  console.error('[Sync] Unhandled error. Sync stopped.', error);
  return;
};
