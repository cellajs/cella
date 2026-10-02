import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('shared', () => ({ appConfig: { slug: 'test' } }));
/** The per-user database's owner listeners, run as local-user-storage runs them after a rebind. */
const ownerListeners = new Set<(owner: string | null) => void>();
vi.mock('~/query/local-user-storage', () => ({
  subscribeOwnerChange: (listener: (owner: string | null) => void) => {
    ownerListeners.add(listener);
    return () => ownerListeners.delete(listener);
  },
}));

const { bindLocalUserDb, closeLocalUserDb } = await import('~/query/local-user-db');
const { onTabMessage, postTabUpdate, toTabKey } = await import('~/modules/common/blocknote/yjs-tab-channel');
type TabMessage = Parameters<Parameters<typeof onTabMessage>[0]>[0];

/** Binds `owner`'s database as sign-in does, and tells the owner listeners. */
function signIn(owner: string | null) {
  if (owner) bindLocalUserDb(owner);
  else closeLocalUserDb();
  for (const listener of ownerListeners) listener(owner);
}

/** Another tab of `owner`: a channel of its own on that user's name. */
function otherTab(owner: string) {
  const received: TabMessage[] = [];
  const channel = new BroadcastChannel(`test:${owner}:ydocs`);
  channel.onmessage = (event: MessageEvent<TabMessage>) => received.push(event.data);
  return { channel, received };
}

const update = (rowId: number | null) =>
  ({
    t: 'update',
    key: toTabKey({ entityType: 'attachment', entityId: 'doc-1' }),
    generation: 'gen-1',
    update: new Uint8Array([1, 2]),
    rowId,
  }) as const;

const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  signIn(null);
});

describe('yjs tab channel', () => {
  it("carries messages between one user's tabs, binary updates included", async () => {
    signIn('user-a');
    const tab = otherTab('user-a');
    const received: TabMessage[] = [];
    stops.push(
      onTabMessage((msg) => received.push(msg)),
      () => tab.channel.close(),
    );

    postTabUpdate(update(7));
    tab.channel.postMessage(update(null));

    await vi.waitFor(() => expect(tab.received).toEqual([update(7)]));
    await vi.waitFor(() => expect(received).toEqual([update(null)]));
    expect(tab.received[0].t === 'update' && tab.received[0].update).toBeInstanceOf(Uint8Array);
  });

  it("must not carry one user's edits to another's tabs: the channel follows the bound database", async () => {
    signIn('user-a');
    const tabA = otherTab('user-a');
    const tabB = otherTab('user-b');
    const received: TabMessage[] = [];
    stops.push(
      onTabMessage((msg) => received.push(msg)),
      () => tabA.channel.close(),
      () => tabB.channel.close(),
    );

    signIn('user-b');
    postTabUpdate(update(1));
    tabA.channel.postMessage(update(2));
    tabB.channel.postMessage(update(3));

    await vi.waitFor(() => expect(received).toEqual([update(3)]));
    await vi.waitFor(() => expect(tabB.received).toEqual([update(1)]));
    expect(tabA.received).toEqual([]);
  });

  it('sends nothing while no database is bound (signed out, or impersonating)', async () => {
    signIn('user-a');
    const tab = otherTab('user-a');
    stops.push(() => tab.channel.close());
    signIn(null);

    postTabUpdate(update(1));
    signIn('user-a');
    postTabUpdate(update(2));

    await vi.waitFor(() => expect(tab.received).toEqual([update(2)]));
  });
});
