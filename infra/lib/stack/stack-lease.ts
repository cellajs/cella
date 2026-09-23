import { acquireLock, type LockInfo, releaseLock, renewLock, type S3Like } from './control-store';

/** Default lease lifetime: long enough to ride out a slow renewal, short enough that a dead run frees the stack within minutes. */
export const DEFAULT_LEASE_TTL_MS = 3 * 60_000;

export interface LeaseOptions {
  s3: S3Like;
  bucket: string;
  key: string;
  owner: string;
  operation: string;
  /** Lease lifetime, renewed while held. */
  ttlMs?: number;
  /** Renewal cadence; defaults to a quarter of the lifetime. */
  renewEveryMs?: number;
  /** How long to wait for a live lock held by someone else before giving up (0 = fail immediately). */
  waitMs?: number;
  /** Poll cadence while waiting. */
  pollMs?: number;
  /** Called on every poll while waiting, with the holder and the time left before giving up. */
  onWait?: (held: LockInfo, remainingMs: number) => void;
  /** Called when a renewal fails (network) or finds the lock taken by someone else. */
  onRenewFailed?: (reason: string, lost: boolean) => void;
  /** Injected for tests. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** A held lease: release it exactly once; `lost` turns true when a renewal found the lock taken by someone else. */
export interface StackLease {
  readonly info: LockInfo;
  readonly lost: boolean;
  release(): Promise<void>;
}

export type LeaseResult = { acquired: true; lease: StackLease } | { acquired: false; held: LockInfo };

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Take the stack lock as a renewed lease. The holder extends the expiry every `renewEveryMs`, so an interrupted run's lock lapses on its own within one
 * lifetime; a caller that finds the lock held may wait up to `waitMs` for that lapse.
 */
export async function acquireLease(opts: LeaseOptions): Promise<LeaseResult> {
  const ttlMs = opts.ttlMs ?? DEFAULT_LEASE_TTL_MS;
  const renewEveryMs = opts.renewEveryMs ?? Math.max(1_000, Math.floor(ttlMs / 4));
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? defaultSleep;
  const deadline = now() + (opts.waitMs ?? 0);
  const lockOpts = { owner: opts.owner, operation: opts.operation, ttlMs };

  let result = await acquireLock(opts.s3, opts.bucket, opts.key, { ...lockOpts, now: now() });
  while (!result.acquired) {
    const remainingMs = deadline - now();
    if (remainingMs <= 0) return { acquired: false, held: result.held };
    opts.onWait?.(result.held, remainingMs);
    await sleep(Math.min(opts.pollMs ?? 10_000, remainingMs));
    result = await acquireLock(opts.s3, opts.bucket, opts.key, { ...lockOpts, now: now() });
  }

  let info = result.info;
  let lost = false;
  let released = false;
  const timer = setInterval(async () => {
    if (released || lost) return;
    try {
      const renewal = await renewLock(opts.s3, opts.bucket, opts.key, opts.owner, ttlMs, now());
      if (renewal.renewed) info = renewal.info;
      else {
        lost = true;
        opts.onRenewFailed?.(
          renewal.held ? `lock now held by ${renewal.held.owner} (${renewal.held.operation})` : 'lock object is gone',
          true,
        );
      }
    } catch (err) {
      opts.onRenewFailed?.(err instanceof Error ? err.message : String(err), false);
    }
  }, renewEveryMs);
  // A pending renewal must never keep a finished process alive.
  timer.unref?.();

  const lease: StackLease = {
    get info() {
      return info;
    },
    get lost() {
      return lost;
    },
    async release() {
      if (released) return;
      released = true;
      clearInterval(timer);
      if (!lost) await releaseLock(opts.s3, opts.bucket, opts.key, opts.owner);
    },
  };
  return { acquired: true, lease };
}

/**
 * Release the lease on SIGINT/SIGTERM before exiting, so a Ctrl-C at a prompt does not leave the stack locked for a full lifetime.
 * Returns the uninstaller; call it after a normal release.
 */
export function installSignalRelease(
  lease: StackLease,
  opts: { exit?: (code: number) => void; log?: (msg: string) => void } = {},
): () => void {
  const exit = opts.exit ?? ((code: number) => process.exit(code));
  const handlers = new Map<NodeJS.Signals, () => void>();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    const handler = () => {
      opts.log?.(`received ${signal}: releasing the stack lock`);
      void lease.release().finally(() => exit(signal === 'SIGINT' ? 130 : 143));
    };
    handlers.set(signal, handler);
    process.once(signal, handler);
  }
  return () => {
    for (const [signal, handler] of handlers) process.off(signal, handler);
  };
}
