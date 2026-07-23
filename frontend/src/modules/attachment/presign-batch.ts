import { onlineManager } from '@tanstack/react-query';
import { getPresignedUrls } from 'sdk/sdk.gen';
import type { CloudFileVariant } from '~/modules/attachment/file-url';
import { subscribeOwnerChange } from '~/query/app-storage';

/**
 * The server rejected this attachment id: denied or nonexistent (the response deliberately does
 * not say which). Permanent for this session; retrying the same request will not help.
 */
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
  reject: (err: unknown) => void;
}

/** Requests arriving within this window coalesce into one batch call. */
const flushWindowMs = 10;
/** Signed URLs live 24h server-side; serve repeats from memory well within that. */
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

/** Resolve one chunk (same tenant/org, ≤50 items) and settle its per-pair promises. */
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
  } catch (err) {
    // Transport failure (offline, 401, rate limit): transient, unlike PresignRejectedError.
    for (const request of requests) request.reject(err);
  }
}

/** Drain the pending queue: group by tenant/org scope, chunk to the server cap, send. */
function flush() {
  flushTimer = null;
  const batch = pending;
  pending = [];

  const byScope = new Map<string, PendingRequest[]>();
  for (const request of batch) {
    const scope = `${request.tenantId}:${request.organizationId}`;
    const requests = byScope.get(scope) ?? [];
    requests.push(request);
    byScope.set(scope, requests);
  }

  for (const requests of byScope.values()) {
    for (let i = 0; i < requests.length; i += maxItemsPerCall) {
      void sendChunk(requests.slice(i, i + maxItemsPerCall));
    }
  }
}

/**
 * Presigned URL for a private attachment, coalesced: concurrent requests within a short window
 * merge into one batch call, identical in-flight pairs share one promise, and signed URLs are
 * memoized for an hour. Rejected ids reject with {@link PresignRejectedError}; transport failures
 * reject with the underlying error. Fails fast when offline.
 */
export function getPresignedUrlBatched(
  attachmentId: string,
  variant: CloudFileVariant,
  tenantId: string,
  organizationId: string,
): Promise<string> {
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
