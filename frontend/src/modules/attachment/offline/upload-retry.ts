import type { AttachmentBlob } from './attachments-db';

/** Eligible for an upload attempt: `pending` always, `failed` once `nextRetryAt` passed and `uploadAttempts` is under the budget, past which it stays `failed`. */
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
