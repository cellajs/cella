// @vitest-environment jsdom
import { act, type ComponentProps, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

type EditorProps = {
  editable?: boolean;
  collaboration?: { fragment: unknown; provider: { awareness: unknown } };
  updateData: (blocks: string) => void;
};

// The editor records the props it was rendered with, and its mounts; everything around the host is inert.
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
  stopped: false,
  stopReason: null as 'denied' | 'refused' | 'expired' | null,
  rebuilds: 0,
  unsynced: false,
  deleted: false,
};
const connection = { awareness: {}, fragment: {}, ...connectionDefaults };
vi.mock('~/modules/common/blocknote/yjs-connections', () => ({
  useYjsConnection: (editSessionId: string | undefined) => (editSessionId ? { ...connection } : null),
}));
vi.mock('~/modules/common/blocknote/hooks/use-yjs-token', () => ({ useYjsToken: () => ({ token: 'token', refused: false, deleted: false }) }));
vi.mock('~/hooks/use-online-manager', () => ({ useOnlineManager: () => true }));
vi.mock('~/modules/common/blocknote/yjs-store', () => ({ isYjsEnabled: () => true, useStoredYDoc: () => ({ stored: false, unsynced: false }) }));
vi.mock('~/modules/user/user-store', () => ({ useCurrentUser: () => ({ name: 'Editor' }) }));
vi.mock('~/modules/common/blocknote/custom-file-panel/upload-host', () => ({
  UploadHostProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock('~/utils/random-color', () => ({ getRandomColor: () => '#000000' }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

const { CollaborativeBlockNote } = await import('~/modules/common/blocknote/collaborative-blocknote');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement;

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
        updateData={() => {}}
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
  editors.length = 0;
  editorMounts = 0;
  Object.assign(connection, { fragment: {}, ...connectionDefaults });
});

describe('CollaborativeBlockNote after the relay reseeded the document', () => {
  it('must not keep an editor on a dropped document: it shows the static while the fresh one syncs, then mounts on the new fragment', async () => {
    await render();
    const dropped = editors.at(-1)?.collaboration?.fragment;
    expect(dropped).toBe(connection.fragment);

    // The connection replaced its document; the new one is not ready yet.
    Object.assign(connection, { fragment: {}, ready: false, transport: 'none', rebuilds: 1 });
    const rendered = editors.length;
    await render();
    expect(editors).toHaveLength(rendered);
    expect(showsStatic()).toBe(true);

    Object.assign(connection, { ready: true, transport: 'ws' });
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
});

describe('CollaborativeBlockNote off the relay', () => {
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
