import type { AttachmentBlob } from './attachments-db';

/**
 * Whether a blob is eligible for an upload attempt: `pending` always, `failed` when the
 * backoff slot (`nextRetryAt`) has passed and `uploadAttempts` is under the configured budget.
 * Blobs past the budget stay `failed` terminally and surface through the upload-status badge.
 */
export function isUploadCandidate(
  blob: Pick<AttachmentBlob, 'uploadStatus' | 'uploadAttempts' | 'nextRetryAt'>,
  retryLimit: number,
  now = Date.now(),
): boolean {
  if (blob.uploadStatus === 'pending') return true;
  if (blob.uploadStatus !== 'failed') return false;
  if ((blob.uploadAttempts ?? 0) >= retryLimit) return false;
  return !blob.nextRetryAt || new Date(blob.nextRetryAt).getTime() <= now;
}
