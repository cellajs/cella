// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { UnstoredYDoc } from '~/modules/common/blocknote/yjs-connections';
import type { UnsavedYDoc } from '~/modules/common/blocknote/yjs-store';

/** What ran, in order; the search the page reads; and the store and connections as the page subscribes to them. */
const seen = vi.hoisted(() => ({
  calls: [] as string[],
  search: { force: undefined as boolean | undefined },
  canGoBack: true,
  flush: { resolve: () => {} },
  flushPending: false,
  /** The rows the store's live query answers first. */
  initial: [] as UnsavedYDoc[],
  stored: undefined as ((docs: UnsavedYDoc[]) => void) | undefined,
  unstored: undefined as ((docs: UnstoredYDoc[]) => void) | undefined,
}));

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => seen.search,
  useRouter: () => ({
    history: { canGoBack: () => seen.canGoBack, back: () => seen.calls.push('went back') },
    navigate: ({ to }: { to: string }) => seen.calls.push(`navigated to ${to}`),
  }),
}));
vi.mock('~/modules/auth/end-session', () => ({
  endSession: vi.fn(async ({ wipe }: { wipe: boolean }) => seen.calls.push(`session ended (wipe: ${wipe})`)),
}));
vi.mock('~/utils/teardown-user-state', () => ({
  teardownUserState: vi.fn(async () => seen.calls.push('client state cleared')),
}));
vi.mock('~/modules/common/blocknote/yjs-store', () => ({
  flushYjsStore: () => {
    seen.calls.push('store flushed');
    return seen.flushPending ? new Promise<void>((resolve) => (seen.flush.resolve = resolve)) : Promise.resolve();
  },
  watchUnsavedYDocs: (cb: (docs: UnsavedYDoc[]) => void) => {
    seen.calls.push('watching stored edits');
    seen.stored = cb;
    cb(seen.initial);
    return () => (seen.stored = undefined);
  },
  loadYDoc: async () => null,
}));
vi.mock('~/modules/common/blocknote/yjs-connections', () => ({
  watchUnstoredYDocs: (cb: (docs: UnstoredYDoc[]) => void) => {
    seen.unstored = cb;
    cb([]);
    return () => (seen.unstored = undefined);
  },
}));
vi.mock('~/query/query-client', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  return { queryClient: new QueryClient() };
});
vi.mock('~/modules/common/content-placeholder', () => ({ ContentPlaceholder: () => null }));
vi.mock('i18next', () => ({ default: { t: (key: string) => key } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const { SignOut } = await import('~/modules/auth/sign-out');
const { queryClient } = await import('~/query/query-client');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;

async function renderSignOut() {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<SignOut />));
}

const emitStored = (docs: UnsavedYDoc[]) => act(async () => seen.stored?.(docs));
const dialog = () => document.querySelector('[role="dialog"]');
const button = (text: string) => {
  const found = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(text));
  if (!found) throw new Error(`no button "${text}"`);
  return found;
};
const listed = () => [...(dialog()?.querySelectorAll('li') ?? [])].map((item) => item.textContent);

const scope = { entityType: 'attachment', tenantId: 'tenant-1', organizationId: 'org-1' } as const;
const unsynced: UnsavedYDoc = { ...scope, entityId: 'att-1', parked: null };
const parked: UnsavedYDoc = { ...scope, entityId: 'att-2', parked: 'deleted' };

beforeEach(() => {
  vi.stubGlobal('location', { href: '' });
  Object.assign(seen, {
    calls: [],
    search: { force: undefined },
    canGoBack: true,
    flushPending: false,
    initial: [],
    stored: undefined,
    unstored: undefined,
  });
  queryClient.clear();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('sign-out with unsaved edits', () => {
  it('signs out at once when nothing is unsaved, after the store wrote what it queued', async () => {
    await renderSignOut();

    // The sign-out effect chain spans a flush, a store subscription and the session call; the default
    // one-second budget runs out on a loaded worker, where this first render also warms the module graph.
    await vi.waitFor(() => expect(seen.calls).toContain('session ended (wipe: true)'), { timeout: 5000 });
    expect(seen.calls).toEqual(['store flushed', 'watching stored edits', 'session ended (wipe: true)']);
    expect(dialog()).toBeNull();
  });

  it('must not read the list before the store wrote what it queued', async () => {
    seen.flushPending = true;
    await renderSignOut();
    expect(seen.calls).toEqual(['store flushed']);

    await act(async () => seen.flush.resolve());
    await vi.waitFor(() => expect(seen.calls).toContain('session ended (wipe: true)'), { timeout: 5000 });
    expect(seen.calls.indexOf('watching stored edits')).toBe(1);
  });

  it('must not discard unsaved edits unasked: the dialog lists them, and confirming ends the session', async () => {
    queryClient.setQueryData(['attachment', 'detail', 'att-1'], { id: 'att-1', name: 'report.pdf' });
    seen.initial = [unsynced, parked];
    await renderSignOut();

    expect(dialog()?.textContent).toContain('c:confirm.sign_out_unsaved');
    expect(listed()).toEqual(['report.pdfc:not_saved', 'c:attachmentc:cannot_save']);
    expect(seen.calls).not.toContain('session ended (wipe: true)');

    await act(async () => button('c:sign_out_anyway').click());
    await vi.waitFor(() => expect(seen.calls).toContain('session ended (wipe: true)'), { timeout: 5000 });
  });

  it('Keep editing goes back, and nothing is torn down', async () => {
    seen.initial = [unsynced];
    await renderSignOut();

    await act(async () => button('c:keep_editing').click());

    expect(seen.calls).toContain('went back');
    expect(seen.calls).not.toContain('session ended (wipe: true)');
    expect(seen.calls).not.toContain('client state cleared');
  });

  it('Keep editing on a page opened directly goes to the default page', async () => {
    seen.canGoBack = false;
    seen.initial = [unsynced];
    await renderSignOut();

    await act(async () => button('c:keep_editing').click());

    expect(seen.calls).toContain('navigated to /home');
  });

  it('continues by itself once the listed edits all saved', async () => {
    seen.initial = [unsynced];
    await renderSignOut();
    expect(dialog()).not.toBeNull();

    // The connections keep saving on the sign-out page; the store's live list empties.
    await emitStored([]);

    await vi.waitFor(() => expect(seen.calls).toContain('session ended (wipe: true)'), { timeout: 5000 });
    expect(dialog()).toBeNull();
  });

  it('lists edits held in memory only, named by their first line', async () => {
    const yDoc = new Y.Doc();
    const paragraph = new Y.XmlElement('paragraph');
    paragraph.insert(0, [new Y.XmlText('Draft written while impersonating')]);
    yDoc.getXmlFragment('document-store').insert(0, [paragraph]);

    await renderSignOut();
    await act(async () => seen.unstored?.([{ entityId: 'att-3', yDoc }]));

    await vi.waitFor(() => expect(listed()).toEqual(['“Draft written while impersonating”c:not_saved']));
  });

  it('force skips the question: the account is gone, so nothing can be saved', async () => {
    seen.search = { force: true };
    await renderSignOut();

    await vi.waitFor(() => expect(seen.calls).toContain('client state cleared'));
    expect(seen.calls).toEqual(['client state cleared']);
    expect(dialog()).toBeNull();
  });
});
