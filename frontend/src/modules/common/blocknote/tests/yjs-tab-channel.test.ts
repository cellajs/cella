import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('shared', () => ({ appConfig: { slug: 'test' } }));

const { bindLocalUserDb, closeLocalUserDb, notifyOwnerChange } = await import('~/query/local-user-db');
const { onTabMessage, postTabMessage, yDocKeyString } = await import('~/modules/common/blocknote/yjs-tab-channel');
type TabMessage = Parameters<Parameters<typeof onTabMessage>[0]>[0];

/** Binds `owner`'s database as sign-in does, and tells the owner listeners, as local-user-storage does once bound. */
function signIn(owner: string | null) {
  if (owner) bindLocalUserDb(owner);
  else closeLocalUserDb();
  notifyOwnerChange(owner);
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
    key: yDocKeyString({ entityType: 'attachment', entityId: 'doc-1' }),
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
  it("must not carry one user's edits to another's tabs: the channel follows the bound database, and sends nothing while none is bound", async () => {
    signIn('user-a');
    const tabA = otherTab('user-a');
    const tabB = otherTab('user-b');
    const received: TabMessage[] = [];
    stops.push(
      onTabMessage((msg) => received.push(msg)),
      () => tabA.channel.close(),
      () => tabB.channel.close(),
    );

    // Signed out, or impersonating: nothing goes out.
    signIn(null);
    postTabMessage(update(1));

    signIn('user-b');
    postTabMessage(update(2));
    tabA.channel.postMessage(update(3));
    tabB.channel.postMessage(update(4));

    await vi.waitFor(() => expect(received).toEqual([update(4)]));
    await vi.waitFor(() => expect(tabB.received).toEqual([update(2)]));
    expect(tabA.received).toEqual([]);
  });
});
