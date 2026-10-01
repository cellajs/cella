// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The editor records the props it was rendered with; everything around the host is inert.
const editors: { editable?: boolean; collaboration?: { fragment: unknown } }[] = [];
vi.mock('~/modules/common/blocknote/blocknote-editor', () => ({
  BlockNote: (props: { editable?: boolean; collaboration?: { fragment: unknown } }) => {
    editors.push(props);
    return null;
  },
}));
const connection = { provider: {}, fragment: {}, synced: true, stopped: false, rebuilds: 0 };
vi.mock('~/modules/common/blocknote/yjs-connections', () => ({
  useYjsConnection: (editSessionId: string | undefined) => (editSessionId ? { ...connection } : null),
}));
vi.mock('~/modules/common/blocknote/hooks/use-yjs-token', () => ({ useYjsToken: () => ({ token: 'token', refused: false }) }));
vi.mock('~/hooks/use-online-manager', () => ({ useOnlineManager: () => true }));
vi.mock('~/modules/user/user-store', () => ({ useCurrentUser: () => ({ name: 'Editor' }) }));
vi.mock('~/modules/common/spinner', () => ({ Spinner: () => null }));
vi.mock('~/modules/common/toaster/toaster', () => ({ toaster: { warning: vi.fn() } }));
vi.mock('~/modules/common/blocknote/custom-file-panel/upload-host', () => ({
  UploadHostProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock('~/utils/random-color', () => ({ getRandomColor: () => '#000000' }));
vi.mock('i18next', () => ({ default: { t: (k: string) => k } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('shared', () => ({ appConfig: { services: { yjs: { enabled: true } }, yjsUrl: 'http://localhost:1234' } }));

const { CollaborativeBlockNote } = await import('~/modules/common/blocknote/collaborative-blocknote');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement;

async function render() {
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
      />,
    ),
  );
}

afterEach(async () => {
  await act(async () => root?.unmount());
  editors.length = 0;
  Object.assign(connection, { fragment: {}, synced: true, stopped: false, rebuilds: 0 });
});

describe('CollaborativeBlockNote after the relay reseeded the document', () => {
  it('must not keep an editor on a dropped document: it waits while the fresh one syncs, then mounts on the new fragment', async () => {
    container = document.createElement('div');
    root = createRoot(container);
    await render();
    const dropped = editors.at(-1)?.collaboration?.fragment;
    expect(dropped).toBe(connection.fragment);

    // The connection replaced its document; the new one has not synced yet.
    Object.assign(connection, { fragment: {}, synced: false, rebuilds: 1 });
    const rendered = editors.length;
    await render();
    expect(editors).toHaveLength(rendered);
    expect(container.textContent).toContain('waiting');

    connection.synced = true;
    await render();
    expect(container.textContent).not.toContain('waiting');
    expect(editors.at(-1)?.collaboration?.fragment).toBe(connection.fragment);
    expect(editors.at(-1)?.collaboration?.fragment).not.toBe(dropped);
  });
});

describe('CollaborativeBlockNote after the relay ends the session', () => {
  it('must not accept edits once the collaborative connection stopped for good', async () => {
    container = document.createElement('div');
    root = createRoot(container);
    await render();
    // Positive control: a live collaborative editor is editable.
    expect(editors.at(-1)?.collaboration).toBeDefined();
    expect(editors.at(-1)?.editable).toBe(true);
    expect(container.textContent).not.toContain('c:collaboration_stopped.text');

    connection.stopped = true;
    await render();

    const last = editors.at(-1);
    // The same collaborative editor, showing what it holds, turned read-only with a notice.
    expect(last?.collaboration).toBeDefined();
    expect(last?.editable).toBe(false);
    expect(container.textContent).toContain('c:collaboration_stopped.text');
  });
});
