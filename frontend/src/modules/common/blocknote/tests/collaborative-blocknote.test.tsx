// @vitest-environment jsdom
import { act, type ComponentProps, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

type EditorProps = {
  editable?: boolean;
  collaboration?: { fragment: unknown; provider: { awareness: unknown } };
  updateData: (blocks: string) => void;
};

// The editor and the static record the props they were rendered with, and the editor its mounts; everything around the host is inert.
const editors: EditorProps[] = [];
let editorMounts = 0;
vi.mock('~/modules/common/blocknote/blocknote-editor', () => ({
  BlockNote: (props: EditorProps) => {
    editors.push(props);
    useEffect(() => {
      editorMounts++;
    }, []);
    return null;
  },
}));
vi.mock('~/modules/common/blocknote/lazy-full-html', () => ({
  BlockNoteFullHtml: ({ defaultValue }: { defaultValue: string }) => <div data-static>{defaultValue}</div>,
}));
const connectionDefaults = {
  ready: true,
  transport: 'ws' as 'none' | 'ws' | 'http',
  synced: true,
  stopped: false,
  stopReason: null as 'denied' | 'refused' | 'expired' | null,
  rebuilds: 0,
  unsynced: false,
  deleted: false,
};
const connection = { awareness: {}, fragment: {}, ...connectionDefaults };
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
// Whether the per-user database holds the document: a stored one opens without a token.
let stored = false;
vi.mock('~/modules/common/blocknote/yjs-store', () => ({ useStoredYDoc: () => ({ stored, unsynced: false }) }));
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
  editorMounts = 0;
  stored = false;
  connectionRequests.length = 0;
  tokenRequests.length = 0;
  updateData.mockClear();
  online = true;
  Object.assign(tokenState, { token: 'token', refused: false, deleted: false });
  Object.assign(connection, { fragment: {}, ...connectionDefaults });
});

describe('CollaborativeBlockNote states', () => {
  it('synced and allowed to edit: the live editor, which commits to the cache only, with no status', async () => {
    await render();

    expect(editors.at(-1)?.collaboration?.fragment).toBe(connection.fragment);
    // The cursors ride the connection's Awareness, which outlives a switch of transport.
    expect(editors.at(-1)?.collaboration?.provider.awareness).toBe(connection.awareness);
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
    Object.assign(connection, { ready: false, transport: 'none', synced: false });
    await render({ waitingFallback: undefined, description: 'written elsewhere' });
    expect(connectionRequests.at(-1)).toBe('attachment-1');
    expect(editors).toHaveLength(0);
    expect(status()).toBe('c:connecting');

    Object.assign(connection, { ready: true, transport: 'ws', synced: true });
    await render({ waitingFallback: undefined, description: 'written elsewhere' });
    expect(editors.at(-1)?.collaboration).toBeDefined();
    expect(container.querySelector('[data-static]')).toBeNull();
    expect(status()).toBeNull();
  });

  it('offline with nothing stored: the static saying offline, then the editor once online and synced', async () => {
    online = false;
    Object.assign(connection, { ready: false, transport: 'none', synced: false });
    await render();

    expect(showsStatic()).toBe(true);
    expect(editors).toHaveLength(0);
    expect(status()).toBe('c:offline');

    online = true;
    Object.assign(connection, { ready: true, transport: 'ws', synced: true });
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

  it('offline mid-session: the editor stays editable, saying offline, and that edits are kept while it holds unsaved ones', async () => {
    await render();
    online = false;
    connection.transport = 'none';
    await render();
    expect(editors.at(-1)?.editable).toBe(true);
    expect(status()).toBe('c:offline');

    connection.unsynced = true;
    await render();
    expect(showsStatic()).toBe(false);
    expect(editors.at(-1)?.editable).toBe(true);
    expect(editors.at(-1)?.collaboration?.fragment).toBe(connection.fragment);
    expect(status()).toBe('c:collaboration_offline.text');
  });

  it('must not keep an editor once edit rights are withdrawn mid-session (token 403): the static says read only', async () => {
    await render();
    const rendered = editors.length;
    Object.assign(tokenState, { token: undefined, refused: true });
    Object.assign(connection, { stopped: true, stopReason: 'denied' });
    await render();

    expect(editors).toHaveLength(rendered);
    expect(showsStatic()).toBe(true);
    expect(status()).toBe('c:read_only');
  });

  it('must not keep an editor once the relay or the HTTP routes deny access (4003, 403): the static says read only', async () => {
    await render();
    const rendered = editors.length;
    Object.assign(connection, { stopped: true, stopReason: 'denied' });
    await render();

    expect(editors).toHaveLength(rendered);
    expect(showsStatic()).toBe(true);
    expect(status()).toBe('c:read_only');
  });

  it('renders no static for a null waitingFallback', async () => {
    Object.assign(connection, { ready: false, synced: false });
    await render({ waitingFallback: null, description: 'stored' });

    expect(container.querySelector('[data-static]')).toBeNull();
    expect(editors).toHaveLength(0);
  });

  it('stopped before it was ever ready: the static with the stopped notice', async () => {
    Object.assign(connection, { ready: false, synced: false, stopped: true, stopReason: 'refused' });
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

    // The connection replaced its document; the new one is not ready yet.
    Object.assign(connection, { fragment: {}, ready: false, transport: 'none', synced: false, rebuilds: 1 });
    const rendered = editors.length;
    await render();
    expect(editors).toHaveLength(rendered);
    expect(showsStatic()).toBe(true);

    Object.assign(connection, { ready: true, transport: 'ws', synced: true });
    await render();
    expect(editorMounts).toBe(2);
    expect(showsStatic()).toBe(false);
    expect(editors.at(-1)?.collaboration?.fragment).toBe(connection.fragment);
    expect(editors.at(-1)?.collaboration?.fragment).not.toBe(dropped);
  });
});

describe('CollaborativeBlockNote after the session ends', () => {
  it('must not accept edits once the relay kept refusing tokens: the read-only editor keeps what it holds, which stays stored', async () => {
    await render();
    // Positive control: a live collaborative editor is editable.
    expect(editors.at(-1)?.collaboration).toBeDefined();
    expect(editors.at(-1)?.editable).toBe(true);
    expect(status()).toBeNull();

    Object.assign(connection, { stopped: true, stopReason: 'expired' });
    await render();

    const last = editors.at(-1);
    // The same collaborative editor, showing what it holds, turned read-only with a notice.
    expect(last?.collaboration).toBeDefined();
    expect(last?.editable).toBe(false);
    expect(editorMounts).toBe(1);
    expect(status()).toBe('error:sync_token_expired.text');
  });

  it('must not keep an editor on a document the relay or the HTTP routes refuse (4400, 1009, 400): the static says collaboration stopped', async () => {
    await render();
    const rendered = editors.length;
    Object.assign(connection, { stopped: true, stopReason: 'refused' });
    await render();

    expect(editors).toHaveLength(rendered);
    expect(showsStatic()).toBe(true);
    expect(status()).toBe('c:collaboration_stopped.text');
  });
});

describe('CollaborativeBlockNote off the relay', () => {
  it('a stored document offline: the live editor from storage, opened without a token, saying offline', async () => {
    online = false;
    stored = true;
    tokenState.token = undefined;
    Object.assign(connection, { transport: 'none', synced: false });
    await render();

    expect(connectionRequests.at(-1)).toBe('attachment-1');
    expect(showsStatic()).toBe(false);
    expect(editors.at(-1)?.editable).toBe(true);
    expect(status()).toBe('c:offline');

    // An edit made offline is kept, and the status says so.
    connection.unsynced = true;
    await render();
    expect(editors.at(-1)?.editable).toBe(true);
    expect(status()).toBe('c:collaboration_offline.text');
  });

  it('a stored document online before either transport synced it: the live editor, saying connecting after a second', async () => {
    vi.useFakeTimers();
    stored = true;
    Object.assign(connection, { transport: 'none', synced: false });
    await render();

    expect(editors.at(-1)?.editable).toBe(true);
    expect(status()).toBeNull();
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(status()).toBe('c:connecting');

    Object.assign(connection, { transport: 'ws', synced: true });
    await render();
    expect(status()).toBeNull();
    expect(editorMounts).toBe(1);
  });

  it('the relay out of reach while the API answers: the live editor over HTTP, saying live sync is limited', async () => {
    connection.transport = 'http';
    await render();

    expect(showsStatic()).toBe(false);
    expect(editors.at(-1)?.editable).toBe(true);
    expect(status()).toBe('c:sync_limited.text');
  });

  it('must not remount the editor across a switch of transport: ws, then http, then ws again keep one instance', async () => {
    await render();
    const fragment = editors.at(-1)?.collaboration?.fragment;
    expect(status()).toBeNull();

    connection.transport = 'http';
    await render();
    expect(status()).toBe('c:sync_limited.text');

    connection.transport = 'ws';
    await render();
    expect(status()).toBeNull();

    expect(editorMounts).toBe(1);
    expect(editors.at(-1)?.collaboration?.fragment).toBe(fragment);
    expect(editors.every((editor) => editor.editable)).toBe(true);
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

  it('shows deleted, not collaboration stopped, for a connection the relay closed with 4410 before it was ready', async () => {
    Object.assign(connection, { ready: false, synced: false, stopped: true, deleted: true });
    await render();

    expect(showsStatic()).toBe(true);
    expect(editors).toHaveLength(0);
    expect(status()).toBe('c:deleted');
  });
});
