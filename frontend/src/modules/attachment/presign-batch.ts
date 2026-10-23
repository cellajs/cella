import { onlineManager } from '@tanstack/react-query';
import { getPresignedUrls } from 'sdk/sdk.gen';
import type { CloudFileVariant } from '~/modules/attachment/file-url';
import { groupBy } from '~/modules/attachment/offline/group-by';
import { subscribeOwnerChange } from '~/query/local-user-db';

/** The server rejected this attachment id, denied or nonexistent; permanent for this session, so retrying will not help. */
export class PresignRejectedError extends Error {
  constructor(attachmentId: string) {
    super(`Presign rejected for attachment ${attachmentId}`);
    this.name = 'PresignRejectedError';
  }
}

interface PendingRequest {
  attachmentId: string;
  variant: CloudFileVariant;
  tenantId: string;
  organizationId: string;
  resolve: (url: string) => void;
  reject: (error: unknown) => void;
}

/** Requests arriving within this window coalesce into one batch call. */
const flushWindowMs = 10;
/** Well under the server's signed-URL lifetime, so a URL served from memory is still valid. */
const memoTtlMs = 60 * 60 * 1000;
/** Server-side cap on items per batch call. */
const maxItemsPerCall = 50;

const memo = new Map<string, { url: string; expiresAt: number }>();
const inflight = new Map<string, Promise<string>>();
let pending: PendingRequest[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let ownerSubscribed = false;

const pairKey = (attachmentId: string, variant: CloudFileVariant) => `${attachmentId}:${variant}`;

/** Signed URLs are per-user: drop them when the signed-in account changes. */
function subscribeOwnerOnce() {
  if (ownerSubscribed) return;
  ownerSubscribed = true;
  subscribeOwnerChange(() => memo.clear());
}

/** Resolves one chunk (one tenant and organization, at most `maxItemsPerCall` items) and settles its per-pair promises. */
async function sendChunk(requests: PendingRequest[]) {
  const { tenantId, organizationId } = requests[0];
  try {
    const response = await getPresignedUrls({
      path: { tenantId, organizationId },
      body: { items: requests.map(({ attachmentId, variant }) => ({ attachmentId, variant })) },
    });
    const urlByPair = new Map(response.data.map((item) => [pairKey(item.attachmentId, item.variant), item.url]));
    const rejected = new Set(response.rejectedIds);

    for (const request of requests) {
      const url = urlByPair.get(pairKey(request.attachmentId, request.variant));
      if (url) {
        memo.set(pairKey(request.attachmentId, request.variant), { url, expiresAt: Date.now() + memoTtlMs });
        request.resolve(url);
      } else if (rejected.has(request.attachmentId)) {
        request.reject(new PresignRejectedError(request.attachmentId));
      } else {
        request.reject(new Error(`No presigned URL returned for ${request.attachmentId}:${request.variant}`));
      }
    }
  } catch (error) {
    // Transport failure (offline, 401, rate limit): transient, unlike PresignRejectedError.
    for (const request of requests) request.reject(error);
  }
}

/** Drain the pending queue: group by tenant/org scope, chunk to the server cap, send. */
function flush() {
  flushTimer = null;
  const batch = pending;
  pending = [];

  for (const requests of groupBy(batch, (request) => `${request.tenantId}:${request.organizationId}`).values()) {
    for (let i = 0; i < requests.length; i += maxItemsPerCall) {
      void sendChunk(requests.slice(i, i + maxItemsPerCall));
    }
  }
}

/**
 * Presigned URL for a private attachment, coalesced: requests within `flushWindowMs` share one batch call, identical in-flight
 * pairs one promise, and URLs are memoized for `memoTtlMs`. A rejected id rejects with {@link PresignRejectedError}, a
 * transport failure with its own error; offline it fails at once.
 */
export function getPresignedUrlBatched(attachmentId: string, variant: CloudFileVariant, tenantId: string, organizationId: string): Promise<string> {
  subscribeOwnerOnce();

  const key = pairKey(attachmentId, variant);
  const cached = memo.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.url);

  const existing = inflight.get(key);
  if (existing) return existing;

  if (!onlineManager.isOnline()) return Promise.reject(new Error('Offline: presigned URL unavailable'));

  const promise = new Promise<string>((resolve, reject) => {
    pending.push({ attachmentId, variant, tenantId, organizationId, resolve, reject });
    if (!flushTimer) flushTimer = setTimeout(flush, flushWindowMs);
  }).finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

/** Reset all coalescer state (memo, in-flight, pending, timer). Test hook. */
export function resetPresignBatch() {
  memo.clear();
  inflight.clear();
  pending = [];
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}
