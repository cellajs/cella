import type { PostAppCatchupResponse, StreamChange, StreamSignal } from 'sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeaderMessage } from '~/query/realtime/tab-coordinator';

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

const { initTabCoordinator, isLeader, onLeaderMessage, postToFollowers, releaseTabLeadership } = await import('~/query/realtime/tab-coordinator');

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
  it('releases the lock on release so a later return re-elects', async () => {
    await initTabCoordinator();
    releaseTabLeadership();
    await tick();

    expect(isLeader()).toBe(false);
    expect(fakeLocks.isHeld('tab-leader')).toBe(false);

    await initTabCoordinator();
    expect(isLeader()).toBe(true);
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

describe('what the leader tells the other tabs', () => {
  const down = { streamHealthy: false, workerAway: true };

  it('reaches the one handler of a follower tab as the leader posted it, and none while this tab leads: a change, a signal, a catchup answer and the health of its stream', async () => {
    const change: StreamChange = {
      action: 'update',
      productType: 'attachment',
      organizationId: 'org-1',
      tenantId: 'tenant-1',
      channelId: null,
      rows: [],
      overflow: null,
      spreadWindow: null,
      propagation: null,
    };
    const signal: StreamSignal = { type: 'notification.read', organizationId: null, subjectId: null };
    const answer: PostAppCatchupResponse = { organizations: {}, views: [], generation: 7 };
    const messages: LeaderMessage[] = [
      { type: 'stream-change', change },
      { type: 'stream-signal', signal },
      { type: 'catchup', response: answer },
      { type: 'sync-health', health: down },
    ];
    const received: unknown[] = [];
    onLeaderMessage((message) => received.push(message));

    // This tab leads, and posts: what another tab posts it ignores, since it acts on its own stream.
    await initTabCoordinator();
    for (const message of messages) postToFollowers(message);
    const posted = FakeBroadcastChannel.opened?.posted.slice(-messages.length) ?? [];
    for (const message of posted) receive(message);
    expect(received).toEqual([]);

    // Another tab leads now: this one follows, runs no catchup and has no stream, and hears what was posted.
    releaseTabLeadership();
    await tick();
    fakeLocks.request('tab-leader', () => new Promise<void>(() => {}));
    await initTabCoordinator();
    expect(isLeader()).toBe(false);

    for (const message of posted) receive(message);

    expect(received).toEqual(messages);
  });

  it('logs a message the follower fails on, which escapes the channel handler no further, and takes the next one', async () => {
    const signal = (subjectId: string): LeaderMessage => ({
      type: 'stream-signal',
      signal: { type: 'notification.read', organizationId: null, subjectId },
    });
    const handled: unknown[] = [];
    onLeaderMessage((message) => {
      if (message.type === 'stream-signal' && message.signal.subjectId === 'bad') throw new Error('handler failed');
      handled.push(message);
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    fakeLocks.request('tab-leader', () => new Promise<void>(() => {}));
    await initTabCoordinator();

    receive(signal('bad'));
    receive(signal('next'));

    expect(handled).toEqual([signal('next')]);
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });

  it('includes the health of its stream, said again to a tab that opens later: every tab announces its version as it opens', async () => {
    await initTabCoordinator();
    postToFollowers({ type: 'sync-health', health: down });
    const posted = FakeBroadcastChannel.opened?.posted ?? [];
    const saidBefore = posted.filter((message) => (message as { type: string }).type === 'sync-health').length;

    receive({ type: 'schema-version', version: 1 });

    expect(posted.filter((message) => (message as { type: string }).type === 'sync-health')).toHaveLength(saidBefore + 1);
    expect(posted.at(-1)).toEqual({ type: 'sync-health', health: down });
  });

  it('posts the health of its stream once it leads again after another leader spoke, also when it posted that health before', async () => {
    const up = { streamHealthy: true, workerAway: false };
    const healthPosts = () => (FakeBroadcastChannel.opened?.posted ?? []).filter((message) => (message as { type: string }).type === 'sync-health');
    await initTabCoordinator();
    postToFollowers({ type: 'sync-health', health: up });
    postToFollowers({ type: 'sync-health', health: up });
    const posts = healthPosts().length;

    // Another tab leads and tells of a failed stream, which this one, following, now holds.
    releaseTabLeadership();
    await tick();
    let releaseOther: () => void = () => {};
    fakeLocks.request('tab-leader', () => new Promise<void>((resolve) => (releaseOther = resolve)));
    await initTabCoordinator();
    receive({ type: 'sync-health', health: down });

    // That tab closes: this one leads again, and its stream says what it said as leader before.
    releaseOther();
    await tick();
    expect(isLeader()).toBe(true);
    postToFollowers({ type: 'sync-health', health: up });

    expect(healthPosts()).toHaveLength(posts + 1);
    expect(healthPosts().at(-1)).toEqual({ type: 'sync-health', health: up });
  });
});
