import { describe, expect, it } from 'vitest';
import { isUploadCandidate } from '../offline/upload-retry';

const NOW = 1_000_000;

describe('isUploadCandidate (failed-upload retry policy, D7)', () => {
  it('pending blobs are always candidates', () => {
    expect(isUploadCandidate({ uploadStatus: 'pending', uploadAttempts: 0, nextRetryAt: null }, 3, NOW)).toBe(true);
  });

  it('failed blobs retry once their backoff slot has passed', () => {
    const blob = { uploadStatus: 'failed' as const, uploadAttempts: 1, nextRetryAt: new Date(NOW - 1) };
    expect(isUploadCandidate(blob, 3, NOW)).toBe(true);
  });

  it('failed blobs wait for their backoff slot', () => {
    const blob = { uploadStatus: 'failed' as const, uploadAttempts: 1, nextRetryAt: new Date(NOW + 60_000) };
    expect(isUploadCandidate(blob, 3, NOW)).toBe(false);
  });

  it('failed blobs past the attempt budget are terminal', () => {
    const blob = { uploadStatus: 'failed' as const, uploadAttempts: 3, nextRetryAt: new Date(NOW - 1) };
    expect(isUploadCandidate(blob, 3, NOW)).toBe(false);
  });

  it('a failed blob without bookkeeping (legacy rows) is retried', () => {
    expect(isUploadCandidate({ uploadStatus: 'failed', uploadAttempts: undefined, nextRetryAt: null }, 3, NOW)).toBe(
      true,
    );
  });

  it('other statuses (uploaded, local-only, uploading) never retry', () => {
    for (const uploadStatus of ['uploaded', 'local-only', 'uploading'] as const) {
      expect(isUploadCandidate({ uploadStatus, uploadAttempts: 0, nextRetryAt: null }, 3, NOW)).toBe(false);
    }
  });
});
