// @vitest-environment jsdom
import { BlockNoteEditor, type PartialBlock } from '@blocknote/core';
import { blocksToYXmlFragment } from '@blocknote/core/yjs';
import { act, type ComponentProps, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { BlockNoteContentApi, CollaborationBundle } from '~/modules/common/blocknote/blocknote-editor';

// The editor and its commit paths are real; only the host's outward boundaries are inert.
vi.mock('~/query/query-client', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  return { queryClient: new QueryClient() };
});
// A collaborative host's relay: online with a token, and the connection a test sets up.
vi.mock('~/hooks/use-online-manager', () => ({ useOnlineManager: () => true }));
vi.mock('~/modules/common/blocknote/hooks/use-yjs-token', () => ({ useYjsToken: () => ({ token: 'token', refused: false }) }));
let liveConnection: unknown = null;
vi.mock('~/modules/common/blocknote/yjs-connections', () => ({ useYjsConnection: (id: string | undefined) => (id ? liveConnection : null) }));
vi.mock('~/modules/user/user-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/modules/user/user-store')>()),
  useCurrentUser: () => ({ name: 'Editor' }),
}));

const { customSchema } = await import('~/modules/common/blocknote/blocknote-schema');
const { checkedExtension } = await import('~/modules/common/blocknote/custom-elements/checklist/checklist-extension');
const { BlockNote } = await import('~/modules/common/blocknote/blocknote-editor');
const { CollaborativeBlockNote } = await import('~/modules/common/blocknote/collaborative-blocknote');
const { setRouter } = await import('~/routes/-router-instance');
const { appConfig } = await import('shared');

type CustomPartialBlock = PartialBlock<typeof customSchema.blockSchema, typeof customSchema.inlineContentSchema, typeof customSchema.styleSchema>;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const headless = BlockNoteEditor.create({ schema: customSchema, _headless: true, extensions: [checkedExtension()] });

/** The document as the editor serializes it, so an untouched editor holds exactly this string. */
const serialize = (blocks: CustomPartialBlock[]) => {
  headless.replaceBlocks(headless.document, blocks);
  return JSON.stringify(headless.document);
};

const checklist = (text: string): CustomPartialBlock[] => [{ id: 'item', type: 'checklistItem', props: { checkboxId: 'box-1' }, content: text }];
const stored = serialize(checklist('todo'));
const otherStored = serialize(checklist('changed elsewhere'));

/** Navigation listeners the editor subscribed on the router. */
const beforeLoadListeners = new Set<() => void>();
setRouter({
  subscribe: (_event: string, listener: () => void) => {
    beforeLoadListeners.add(listener);
    return () => beforeLoadListeners.delete(listener);
  },
} as never);
const navigate = () =>
  act(() => {
    for (const listener of beforeLoadListeners) listener();
  });

let root: Root;
let container: HTMLDivElement;
const contentApi = createRef<BlockNoteContentApi>();

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const editorElement = () => container.querySelector<HTMLElement>('.bn-editor') as HTMLElement;
const blur = () => act(() => editorElement().dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
const pressEscape = () => act(() => editorElement().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
const unmount = () => act(async () => root.unmount());
/** A real edit through the editor: toggles the checklist item's checkbox. */
const edit = () => act(() => expect(contentApi.current?.toggleChecklist('box-1')).toBe(true));

// No Awareness: the editor runs without cursors.
const bundle = (fragment: Y.XmlFragment) => ({
  provider: {} as CollaborationBundle['provider'],
  fragment,
  user: { name: 'Editor', color: '#000000' },
});
const emptyFragment = () => new Y.Doc().getXmlFragment('document-store');
const seededFragment = () => blocksToYXmlFragment(headless, checklist('todo') as never, emptyFragment());

type BlockNoteProps = Partial<ComponentProps<typeof BlockNote>>;
type HostProps = Partial<ComponentProps<typeof CollaborativeBlockNote>>;

/** A type with Yjs off: CollaborativeBlockNote hosts the standalone editor on the stored description. */
const withYjsOff = () => {
  const enabled = appConfig.services.yjs.enabled;
  beforeEach(() => {
    appConfig.services.yjs.enabled = false;
  });
  afterEach(() => {
    appConfig.services.yjs.enabled = enabled;
  });
};

const renderHost = (props: HostProps) =>
  act(async () =>
    root.render(
      <CollaborativeBlockNote
        entityType="attachment"
        entityId="attachment-1"
        tenantId="tenant-1"
        organizationId="org-1"
        canEdit
        description={stored}
        updateData={() => {}}
        contentApiRef={contentApi}
        {...props}
      />,
    ),
  );

describe('standalone BlockNote commits', () => {
  const renderEditor = (props: BlockNoteProps) =>
    act(async () => root.render(<BlockNote id="doc" updateData={() => {}} contentApiRef={contentApi} {...props} />));

  it('commits once for Escape followed by blur and unmount', async () => {
    const updateData = vi.fn();
    const onEscapeClick = vi.fn();
    await renderEditor({ defaultValue: stored, updateData, onEscapeClick });

    await edit();
    const edited = contentApi.current?.getContent();
    await pressEscape();
    await blur();
    await unmount();

    expect(onEscapeClick).toHaveBeenCalledOnce();
    expect(updateData).toHaveBeenCalledExactlyOnceWith(edited);
  });

  it('commits a changed document on unmount when no blur fired', async () => {
    const updateData = vi.fn();
    await renderEditor({ defaultValue: stored, updateData });

    await edit();
    const edited = contentApi.current?.getContent();
    await unmount();

    expect(updateData).toHaveBeenCalledExactlyOnceWith(edited);
  });

  it('never commits an untouched document, on blur, Escape or unmount, though it serializes differently or defaultValue moved', async () => {
    const updateData = vi.fn();
    const unnormalized = JSON.stringify([
      { id: 'p', type: 'paragraph', props: {}, content: [{ type: 'text', text: 'hello', styles: {} }], children: [] },
    ]);
    await renderEditor({ defaultValue: unnormalized, updateData });
    expect(contentApi.current?.getContent()).not.toBe(unnormalized);

    await renderEditor({ defaultValue: otherStored, updateData });
    await blur();
    await pressEscape();
    await unmount();

    expect(updateData).not.toHaveBeenCalled();
  });
});

describe('collaborative BlockNote commits', () => {
  const renderEditor = (fragment: Y.XmlFragment, props: BlockNoteProps = {}) =>
    act(async () =>
      root.render(
        <BlockNote id="doc" defaultValue="" updateData={() => {}} contentApiRef={contentApi} collaboration={bundle(fragment)} {...props} />,
      ),
    );

  it('never commits an empty document, on blur, Escape or unmount', async () => {
    const updateData = vi.fn();
    await renderEditor(emptyFragment(), { updateData });

    await blur();
    await pressEscape();
    await unmount();

    expect(updateData).not.toHaveBeenCalled();
  });
});

describe('CollaborativeBlockNote with Yjs off', () => {
  withYjsOff();

  it('writes on navigation only a user change, compared with the description current then', async () => {
    const updateData = vi.fn();
    await renderHost({ updateData });

    // Untouched: a description that moved after mount is no reason to write.
    await renderHost({ description: otherStored, updateData });
    await navigate();
    expect(updateData).not.toHaveBeenCalled();

    await edit();
    const edited = contentApi.current?.getContent();
    await navigate();
    expect(updateData).toHaveBeenCalledExactlyOnceWith(edited, false);

    // The edit's own write landed in the description: nothing is left to write.
    await renderHost({ description: edited, updateData });
    await navigate();
    expect(updateData).toHaveBeenCalledOnce();
  });
});

describe('CollaborativeBlockNote with Yjs on', () => {
  afterEach(() => {
    liveConnection = null;
  });

  it('makes no REST write on navigation or unmount, however the document changed: unmount patches the cache', async () => {
    liveConnection = {
      awareness: undefined,
      fragment: seededFragment(),
      ready: true,
      transport: 'ws',
      stopped: false,
      rebuilds: 0,
      unsynced: false,
    };
    const updateData = vi.fn();
    await renderHost({ updateData });
    expect(contentApi.current?.getContent()).toBe(stored);

    await edit();
    await navigate();
    expect(updateData).not.toHaveBeenCalled();
    const edited = contentApi.current?.getContent();
    await unmount();

    expect(updateData).toHaveBeenCalledExactlyOnceWith(edited, true);
  });
});

describe('BlockNote onEditorReady', () => {
  const renderEditor = (props: BlockNoteProps) =>
    act(async () => root.render(<BlockNote id="doc" defaultValue={stored} updateData={() => {}} {...props} />));

  it('fires once per editor instance, whatever callback a re-render passes', async () => {
    const first = vi.fn();
    const second = vi.fn();
    await renderEditor({ onEditorReady: first });
    await renderEditor({ onEditorReady: second });

    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();

    // A new editor instance reports itself ready again.
    await act(async () => root.render(<BlockNote key="rebuilt" id="doc" defaultValue={stored} updateData={() => {}} onEditorReady={second} />));
    expect(second).toHaveBeenCalledOnce();
  });
});

describe('BlockNote commit through the content api', () => {
  it('commits a checklist toggle made on ready as a user change of a standalone editor', async () => {
    const updateData = vi.fn();
    const toggleOnReady = () => {
      contentApi.current?.toggleChecklist('box-1');
      contentApi.current?.commit();
    };
    await act(async () =>
      root.render(<BlockNote id="doc" defaultValue={stored} updateData={updateData} contentApiRef={contentApi} onEditorReady={toggleOnReady} />),
    );

    expect(updateData).toHaveBeenCalledExactlyOnceWith(contentApi.current?.getContent());
    expect(updateData.mock.calls[0][0]).not.toBe(stored);
  });
});
