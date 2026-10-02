// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

type EditorProps = { editable?: boolean; collaboration?: { fragment: unknown }; updateData: (blocks: string) => void };

// The editor and the static record the props they were rendered with; everything around the host is inert.
const editors: EditorProps[] = [];
vi.mock('~/modules/common/blocknote/blocknote-editor', () => ({
  BlockNote: (props: EditorProps) => {
    editors.push(props);
    return null;
  },
}));
vi.mock('~/modules/common/blocknote/lazy-full-html', () => ({
  BlockNoteFullHtml: ({ defaultValue }: { defaultValue: string }) => <div data-static>{defaultValue}</div>,
}));
const connection = { provider: {}, fragment: {}, synced: true, stopped: false, rebuilds: 0, unsynced: false, deleted: false };
const connectionRequests: (string | undefined)[] = [];
vi.mock('~/modules/common/blocknote/yjs-connections', () => ({
  useYjsConnection: (editSessionId: string | undefined) => {
    connectionRequests.push(editSessionId);
    return editSessionId ? { ...connection } : null;
  },
}));
const tokenState: { token: string | undefined; refused: boolean; deleted: boolean } = { token: 'token', refused: false, deleted: false };
const tokenRequests: { enabled: boolean }[] = [];
vi.mock('~/modules/common/blocknote/hooks/use-yjs-token', () => ({
  useYjsToken: (params: { enabled: boolean }) => {
    tokenRequests.push(params);
    return { ...tokenState };
  },
}));
let online = true;
vi.mock('~/hooks/use-online-manager', () => ({ useOnlineManager: () => online }));
vi.mock('~/modules/user/user-store', () => ({ useCurrentUser: () => ({ name: 'Editor' }) }));
vi.mock('~/modules/common/blocknote/custom-file-panel/upload-host', () => ({
  UploadHostProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock('~/utils/random-color', () => ({ getRandomColor: () => '#000000' }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('shared', () => ({ appConfig: { services: { yjs: { enabled: true } }, yjsUrl: 'http://localhost:1234' } }));

const { CollaborativeBlockNote } = await import('~/modules/common/blocknote/collaborative-blocknote');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement;
const updateData = vi.fn();

async function render(props: Partial<ComponentProps<typeof CollaborativeBlockNote>> = {}) {
  if (!root) {
    container = document.createElement('div');
    root = createRoot(container);
  }
  await act(async () =>
    root?.render(
      <CollaborativeBlockNote
        entityType="attachment"
        entityId="attachment-1"
        tenantId="tenant-1"
        organizationId="org-1"
        canEdit
        description={null}
        updateData={updateData}
        waitingFallback={<p>waiting</p>}
        {...props}
      />,
    ),
  );
}

const status = () => container.querySelector('[role="status"]')?.textContent ?? null;
const showsStatic = () => container.textContent?.includes('waiting') ?? false;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.useRealTimers();
  editors.length = 0;
  connectionRequests.length = 0;
  tokenRequests.length = 0;
  updateData.mockClear();
  online = true;
  Object.assign(tokenState, { token: 'token', refused: false, deleted: false });
  Object.assign(connection, { fragment: {}, synced: true, stopped: false, rebuilds: 0, unsynced: false, deleted: false });
});

describe('CollaborativeBlockNote states', () => {
  it('synced and allowed to edit: the live editor, which commits to the cache only, with no status', async () => {
    await render();

    expect(editors.at(-1)?.collaboration?.fragment).toBe(connection.fragment);
    expect(editors.at(-1)?.editable).toBe(true);
    expect(showsStatic()).toBe(false);
    expect(status()).toBeNull();

    editors.at(-1)?.updateData('blocks');
    expect(updateData).toHaveBeenCalledExactlyOnceWith('blocks', true);
  });

  it('connecting: the static bound to the description, saying so after a second, then the editor once synced', async () => {
    vi.useFakeTimers();
    tokenState.token = undefined;
    await render({ waitingFallback: undefined, description: 'stored' });

    expect(editors).toHaveLength(0);
    expect(connectionRequests.every((id) => id === undefined)).toBe(true);
    expect(container.querySelector('[data-static]')?.textContent).toBe('stored');
    // A quick connection shows no notice.
    expect(status()).toBeNull();
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(status()).toBe('c:connecting');

    // The static follows the description.
    await render({ waitingFallback: undefined, description: 'written elsewhere' });
    expect(container.querySelector('[data-static]')?.textContent).toBe('written elsewhere');

    // The token arrives, and the relay is slow: still connecting.
    tokenState.token = 'token';
    connection.synced = false;
    await render({ waitingFallback: undefined, description: 'written elsewhere' });
    expect(connectionRequests.at(-1)).toBe('attachment-1');
    expect(editors).toHaveLength(0);
    expect(status()).toBe('c:connecting');

    connection.synced = true;
    await render({ waitingFallback: undefined, description: 'written elsewhere' });
    expect(editors.at(-1)?.collaboration).toBeDefined();
    expect(container.querySelector('[data-static]')).toBeNull();
    expect(status()).toBeNull();
  });

  it('offline at mount: the static saying offline, then the editor once online and synced', async () => {
    online = false;
    connection.synced = false;
    await render();

    expect(showsStatic()).toBe(true);
    expect(editors).toHaveLength(0);
    expect(status()).toBe('c:offline');

    online = true;
    connection.synced = true;
    await render();
    expect(showsStatic()).toBe(false);
    expect(editors.at(-1)?.editable).toBe(true);
  });

  it('token refused (403): the static saying read only, and no connection', async () => {
    Object.assign(tokenState, { token: undefined, refused: true });
    await render();

    expect(showsStatic()).toBe(true);
    expect(editors).toHaveLength(0);
    expect(status()).toBe('c:read_only');
    expect(connectionRequests.every((id) => id === undefined)).toBe(true);
  });

  it('entity gone (token 404): the static saying deleted, and no connection', async () => {
    Object.assign(tokenState, { token: undefined, deleted: true });
    await render();

    expect(showsStatic()).toBe(true);
    expect(editors).toHaveLength(0);
    expect(status()).toBe('c:deleted');
    expect(connectionRequests.every((id) => id === undefined)).toBe(true);
  });

  it('may not edit: the static alone, with no token fetched and no connection opened', async () => {
    await render({ canEdit: false });

    expect(showsStatic()).toBe(true);
    expect(editors).toHaveLength(0);
    expect(status()).toBeNull();
    expect(tokenRequests).toHaveLength(0);
    expect(connectionRequests).toHaveLength(0);
  });

  it('offline mid-session: the editor stays editable and says edits are kept while it holds unsaved ones', async () => {
    await render();
    online = false;
    await render();
    expect(editors.at(-1)?.editable).toBe(true);
    expect(status()).toBeNull();

    connection.unsynced = true;
    await render();
    expect(showsStatic()).toBe(false);
    expect(editors.at(-1)?.editable).toBe(true);
    expect(editors.at(-1)?.collaboration?.fragment).toBe(connection.fragment);
    expect(status()).toBe('c:collaboration_offline.text');
  });

  it('a token refused mid-session keeps the stopped editor and what it holds, read-only', async () => {
    await render();
    Object.assign(tokenState, { token: undefined, refused: true });
    connection.stopped = true;
    await render();

    expect(connectionRequests.at(-1)).toBe('attachment-1');
    expect(editors.at(-1)?.collaboration).toBeDefined();
    expect(editors.at(-1)?.editable).toBe(false);
    expect(status()).toBe('c:collaboration_stopped.text');
  });

  it('renders no static for a null waitingFallback', async () => {
    connection.synced = false;
    await render({ waitingFallback: null, description: 'stored' });

    expect(container.querySelector('[data-static]')).toBeNull();
    expect(editors).toHaveLength(0);
  });

  it('stopped before it ever synced: the static with the stopped notice', async () => {
    Object.assign(connection, { synced: false, stopped: true });
    await render();

    expect(showsStatic()).toBe(true);
    expect(editors).toHaveLength(0);
    expect(status()).toBe('c:collaboration_stopped.text');
  });
});

describe('CollaborativeBlockNote after the relay reseeded the document', () => {
  it('must not keep an editor on a dropped document: it shows the static while the fresh one syncs, then mounts on the new fragment', async () => {
    await render();
    const dropped = editors.at(-1)?.collaboration?.fragment;
    expect(dropped).toBe(connection.fragment);

    // The connection replaced its document; the new one has not synced yet.
    Object.assign(connection, { fragment: {}, synced: false, rebuilds: 1 });
    const rendered = editors.length;
    await render();
    expect(editors).toHaveLength(rendered);
    expect(showsStatic()).toBe(true);

    connection.synced = true;
    await render();
    expect(showsStatic()).toBe(false);
    expect(editors.at(-1)?.collaboration?.fragment).toBe(connection.fragment);
    expect(editors.at(-1)?.collaboration?.fragment).not.toBe(dropped);
  });
});

describe('CollaborativeBlockNote after the relay ends the session', () => {
  it('must not accept edits once the collaborative connection stopped for good', async () => {
    await render();
    // Positive control: a live collaborative editor is editable.
    expect(editors.at(-1)?.collaboration).toBeDefined();
    expect(editors.at(-1)?.editable).toBe(true);
    expect(status()).toBeNull();

    connection.stopped = true;
    await render();

    const last = editors.at(-1);
    // The same collaborative editor, showing what it holds, turned read-only with a notice.
    expect(last?.collaboration).toBeDefined();
    expect(last?.editable).toBe(false);
    expect(status()).toBe('c:collaboration_stopped.text');
  });
});

describe('CollaborativeBlockNote after the entity is deleted', () => {
  it('must not show an editor whose unsaved edits were discarded: the relay closed with 4410, and the static says deleted', async () => {
    await render();
    const rendered = editors.length;

    // The connection stopped as deleted, while the token it holds is still valid.
    Object.assign(connection, { stopped: true, deleted: true });
    await render();

    expect(editors).toHaveLength(rendered);
    expect(showsStatic()).toBe(true);
    expect(status()).toBe('c:deleted');
  });

  it('shows deleted, not collaboration stopped, for a connection the relay closed with 4410 before it synced', async () => {
    Object.assign(connection, { synced: false, stopped: true, deleted: true });
    await render();

    expect(showsStatic()).toBe(true);
    expect(editors).toHaveLength(0);
    expect(status()).toBe('c:deleted');
  });
});
