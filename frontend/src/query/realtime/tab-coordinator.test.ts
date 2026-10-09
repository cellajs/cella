import type { PostAppCatchupResponse } from 'sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('shared/schema-evolution', () => ({ currentSchemaVersion: 1 }));
vi.mock('~/query/schema-version-guard', () => ({ markBundleStale: vi.fn() }));

/**
 * Minimal Web Locks fake: one named lock with a FIFO waiter queue. `ifAvailable` grants-or-nulls
 * immediately; a signalled request queues until the lock frees and rejects with AbortError if the
 * signal fires first. A granted lock is held until the callback's returned promise settles.
 */
class FakeLocks {
  private held = new Set<string>();
  private queues = new Map<string, Array<() => void>>();

  request(name: string, optionsOrCb: unknown, maybeCb?: (lock: unknown) => unknown): Promise<unknown> {
    const opts = (typeof optionsOrCb === 'object' && optionsOrCb !== null ? optionsOrCb : {}) as { ifAvailable?: boolean; signal?: AbortSignal };
    const cb = (typeof optionsOrCb === 'function' ? optionsOrCb : maybeCb) as (lock: unknown) => unknown;

    if (opts.ifAvailable) {
      if (this.held.has(name)) return Promise.resolve(cb(null));
      return this.grant(name, cb);
    }

    if (!this.held.has(name)) return this.grant(name, cb);

    return new Promise((resolve, reject) => {
      const signal = opts.signal;
      const attempt = () => {
        signal?.removeEventListener('abort', onAbort);
        this.grant(name, cb).then(resolve, reject);
      };
      const onAbort = () => {
        const queue = this.queues.get(name);
        const index = queue?.indexOf(attempt) ?? -1;
        if (queue && index >= 0) queue.splice(index, 1);
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener('abort', onAbort, { once: true });
      const queue = this.queues.get(name) ?? [];
      queue.push(attempt);
      this.queues.set(name, queue);
    });
  }

  private grant(name: string, callback: (lock: unknown) => unknown): Promise<unknown> {
    this.held.add(name);
    const result = Promise.resolve(callback({ name }));
    result.finally(() => {
      this.held.delete(name);
      this.queues.get(name)?.shift()?.();
    });
    return result;
  }

  isHeld(name: string): boolean {
    return this.held.has(name);
  }

  reset(): void {
    this.held.clear();
    this.queues.clear();
  }
}

class FakeBroadcastChannel {
  /** The channel the coordinator opened: it opens one and keeps it. */
  static opened: FakeBroadcastChannel | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  posted: unknown[] = [];
  constructor(public name: string) {
    FakeBroadcastChannel.opened = this;
  }
  postMessage(message: unknown): void {
    this.posted.push(message);
  }
  close(): void {}
}

/** What another tab posted, as this tab receives it. */
const receive = (message: unknown) => FakeBroadcastChannel.opened?.onmessage?.({ data: message } as MessageEvent);

const fakeLocks = new FakeLocks();
vi.stubGlobal('navigator', { locks: fakeLocks });
vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);

const { broadcastCatchup, broadcastSyncHealth, initTabCoordinator, isLeader, onCatchup, onSyncHealth, releaseTabLeadership } = await import(
  './tab-coordinator'
);

/** Flush microtasks + timers so lock grants and promotions settle. */
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  releaseTabLeadership();
  fakeLocks.reset();
});

afterEach(async () => {
  releaseTabLeadership();
  await tick();
  fakeLocks.reset();
});

describe('tab coordinator leadership', () => {
  it('becomes leader and holds the lock when it is free', async () => {
    await initTabCoordinator();

    expect(isLeader()).toBe(true);
    expect(fakeLocks.isHeld('tab-leader')).toBe(true);
  });

  it('releases the lock on release so a later return re-elects', async () => {
    await initTabCoordinator();
    releaseTabLeadership();
    await tick();

    expect(isLeader()).toBe(false);
    expect(fakeLocks.isHeld('tab-leader')).toBe(false);

    await initTabCoordinator();
    expect(isLeader()).toBe(true);
  });

  it('parks as follower while another tab holds leadership', async () => {
    fakeLocks.request('tab-leader', () => new Promise<void>(() => {}));

    await initTabCoordinator();

    expect(isLeader()).toBe(false);
  });

  it('promotes a follower when the leader releases on leaving the app', async () => {
    // Another tab is leader (it is in the app, holding the stream).
    let releaseOther: () => void = () => {};
    const otherHold = new Promise<void>((resolve) => {
      releaseOther = resolve;
    });
    fakeLocks.request('tab-leader', () => otherHold);

    await initTabCoordinator();
    expect(isLeader()).toBe(false); // follower: listening to broadcasts only

    // The leader navigates to a public route and releases leadership.
    releaseOther();
    await tick();

    // The follower must take over so the SSE stream stays alive for every tab.
    expect(isLeader()).toBe(true);
    expect(fakeLocks.isHeld('tab-leader')).toBe(true);
  });
});

describe('a catchup answer, between tabs', () => {
  const answer: PostAppCatchupResponse = { cursor: 'c9', changes: {}, generation: 7 };

  it('reaches a follower, which sends no catchup request of its own', async () => {
    fakeLocks.request('tab-leader', () => new Promise<void>(() => {}));
    await initTabCoordinator();
    const heard: Array<[PostAppCatchupResponse, boolean]> = [];
    const stop = onCatchup((response, baselineOnly) => heard.push([response, baselineOnly]));

    receive({ type: 'catchup', response: answer, baselineOnly: false });
    stop();
    receive({ type: 'catchup', response: answer, baselineOnly: true });

    expect(heard).toEqual([[answer, false]]);
  });

  it('is not acted on by the leader: it processed the answer to its own request', async () => {
    await initTabCoordinator();
    const heard: Array<[PostAppCatchupResponse, boolean]> = [];
    const stop = onCatchup((response, baselineOnly) => heard.push([response, baselineOnly]));

    receive({ type: 'catchup', response: answer, baselineOnly: false });
    stop();

    expect(isLeader()).toBe(true);
    expect(heard).toEqual([]);
  });

  it('is posted to the other tabs by the leader', async () => {
    await initTabCoordinator();

    broadcastCatchup(answer, true);

    expect(FakeBroadcastChannel.opened?.posted).toContainEqual({ type: 'catchup', response: answer, baselineOnly: true });
  });
});

describe("the health of the leader's stream, between tabs", () => {
  const down = { streamHealthy: false, workerAway: true };

  it('reaches a follower, which has no stream of its own to judge by', async () => {
    fakeLocks.request('tab-leader', () => new Promise<void>(() => {}));
    await initTabCoordinator();
    const heard: unknown[] = [];
    const stop = onSyncHealth((health) => heard.push(health));

    receive({ type: 'sync-health', health: down });
    stop();
    receive({ type: 'sync-health', health: { streamHealthy: true, workerAway: false } });

    expect(heard).toEqual([down]);
  });

  it('is not acted on by the leader: its own stream says', async () => {
    await initTabCoordinator();
    const heard: unknown[] = [];
    const stop = onSyncHealth((health) => heard.push(health));

    receive({ type: 'sync-health', health: down });
    stop();

    expect(heard).toEqual([]);
  });

  it('is said again by the leader to a tab that opens later: every tab announces its version as it opens', async () => {
    await initTabCoordinator();
    broadcastSyncHealth(down);
    const posted = FakeBroadcastChannel.opened?.posted ?? [];
    const saidBefore = posted.filter((message) => (message as { type: string }).type === 'sync-health').length;

    receive({ type: 'schema-version', version: 1 });

    expect(posted.filter((message) => (message as { type: string }).type === 'sync-health')).toHaveLength(saidBefore + 1);
    expect(posted.at(-1)).toEqual({ type: 'sync-health', health: down });
  });

  it('must not be answered by a follower: it only knows what it was told', async () => {
    fakeLocks.request('tab-leader', () => new Promise<void>(() => {}));
    await initTabCoordinator();
    const posted = FakeBroadcastChannel.opened?.posted ?? [];
    const saidBefore = posted.length;

    receive({ type: 'schema-version', version: 1 });

    expect(posted.slice(saidBefore)).toEqual([]);
  });
});
