// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnsaveableYDocRecord } from '~/query/local-user-db';

const showUnsaveableNotice = vi.hoisted(() => vi.fn(async (_record: UnsaveableYDocRecord) => {}));
vi.mock('~/modules/common/blocknote/unsaveable-notices', () => ({ showUnsaveableNotice }));
// The election itself is the tab coordinator's; this file sets its outcome.
vi.mock('~/query/realtime/tab-coordinator', async () => {
  const { createStore } = await import('zustand/vanilla');
  return { tabCoordinatorStore: createStore(() => ({ isLeader: false, isReady: false })) };
});

const { ParkedNoticesOnBoot } = await import('~/modules/common/blocknote/parked-notices-on-boot');
const { tabCoordinatorStore } = await import('~/query/realtime/tab-coordinator');
const { bindLocalUserDb } = await import('~/query/local-user-db');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const db = bindLocalUserDb('user-boot');
const parkedRow = {
  entityType: 'attachment',
  entityId: 'att-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  generation: 'gen-1',
  reason: 'deleted',
  state: new Uint8Array([0, 0]),
  at: 1,
} as const;

let root: Root | undefined;

const boot = () =>
  act(async () => {
    root = createRoot(document.createElement('div'));
    root.render(<ParkedNoticesOnBoot />);
  });
const elect = (state: { isReady: boolean; isLeader: boolean }) => act(async () => tabCoordinatorStore.setState(state));

beforeEach(async () => {
  showUnsaveableNotice.mockClear();
  tabCoordinatorStore.setState({ isReady: false, isLeader: false });
  await db.unsaveableYDocs.clear();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
});

describe('parked edits at boot', () => {
  it('shows each row still parked in the leader tab, once the election settled', async () => {
    const id = await db.unsaveableYDocs.add({ ...parkedRow });
    await boot();
    expect(showUnsaveableNotice).not.toHaveBeenCalled();

    await elect({ isReady: true, isLeader: true });
    await vi.waitFor(() => expect(showUnsaveableNotice).toHaveBeenCalledOnce());
    // The state comes back through IndexedDB's clone, a typed array of another realm: compared by its bytes.
    const { state, ...shown } = showUnsaveableNotice.mock.calls[0][0];
    const { state: parkedState, ...parked } = parkedRow;
    expect(shown).toEqual({ ...parked, id });
    expect([...state]).toEqual([...parkedState]);
  });

  it('must not repeat the notices in a follower tab, also once it is promoted later', async () => {
    await db.unsaveableYDocs.add({ ...parkedRow });
    await elect({ isReady: true, isLeader: false });
    await boot();

    await elect({ isReady: true, isLeader: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(showUnsaveableNotice).not.toHaveBeenCalled();
  });

  it('shows nothing when no edits are parked (positive control)', async () => {
    await elect({ isReady: true, isLeader: true });
    await boot();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(showUnsaveableNotice).not.toHaveBeenCalled();
  });
});
