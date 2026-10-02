// @vitest-environment jsdom
import { BlockNoteEditor, type PartialBlock } from '@blocknote/core';
import { blocksToYXmlFragment } from '@blocknote/core/yjs';
import { act, type ComponentProps, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import type { BlockNoteContentApi } from '~/modules/common/blocknote/blocknote-editor';

// The editor and its commit paths are real; only the host's outward boundaries are inert.
vi.mock('~/query/query-client', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  return { queryClient: new QueryClient() };
});
// Offline, so CollaborativeBlockNote opens the standalone editor at once.
vi.mock('~/hooks/use-online-manager', () => ({ useOnlineManager: () => false }));
vi.mock('~/modules/common/blocknote/hooks/use-yjs-token', () => ({ useYjsToken: () => ({ token: undefined, refused: false }) }));
vi.mock('~/modules/common/blocknote/yjs-connections', () => ({ useYjsConnection: () => null }));
vi.mock('~/modules/user/user-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/modules/user/user-store')>()),
  useCurrentUser: () => ({ name: 'Editor' }),
}));

const { customSchema } = await import('~/modules/common/blocknote/blocknote-config');
const { checkedExtension } = await import('~/modules/common/blocknote/custom-elements/checklist/checklist-extension');
const { BlockNote } = await import('~/modules/common/blocknote/blocknote-editor');
const { CollaborativeBlockNote } = await import('~/modules/common/blocknote/collaborative-blocknote');
const { setRouter } = await import('~/routes/-router-instance');

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

const bundle = (fragment: Y.XmlFragment) => ({ provider: {} as WebsocketProvider, fragment, user: { name: 'Editor', color: '#000000' } });
const emptyFragment = () => new Y.Doc().getXmlFragment('document-store');
const seededFragment = () => blocksToYXmlFragment(headless, checklist('todo') as never, emptyFragment());

type BlockNoteProps = Partial<ComponentProps<typeof BlockNote>>;
type HostProps = Partial<ComponentProps<typeof CollaborativeBlockNote>>;

/** CollaborativeBlockNote offline: the standalone editor on the stored description. */
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

  it('holds the stored document untouched', async () => {
    await renderEditor({ defaultValue: stored });

    expect(contentApi.current?.getContent()).toBe(stored);
  });

  it('commits a changed document on blur', async () => {
    const updateData = vi.fn();
    await renderEditor({ defaultValue: stored, updateData });

    await edit();
    await blur();

    expect(updateData).toHaveBeenCalledExactlyOnceWith(contentApi.current?.getContent());
    expect(updateData.mock.calls[0][0]).not.toBe(stored);
  });

  it('does not commit on blur when the document equals defaultValue', async () => {
    const updateData = vi.fn();
    await renderEditor({ defaultValue: stored, updateData });

    await blur();

    expect(updateData).not.toHaveBeenCalled();
  });

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

  it('does not commit on unmount when the document equals defaultValue', async () => {
    const updateData = vi.fn();
    await renderEditor({ defaultValue: stored, updateData });

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

  it('commits a changed document on blur', async () => {
    const updateData = vi.fn();
    await renderEditor(seededFragment(), { updateData });

    await edit();
    await blur();

    expect(updateData).toHaveBeenCalledExactlyOnceWith(contentApi.current?.getContent());
  });

  it('does not commit on unmount', async () => {
    const updateData = vi.fn();
    await renderEditor(seededFragment(), { updateData });

    await edit();
    await unmount();

    expect(updateData).not.toHaveBeenCalled();
  });
});

describe('CollaborativeBlockNote standalone navigation write', () => {
  it('writes the editor document as a standalone update when it differs from the description', async () => {
    const updateData = vi.fn();
    await renderHost({ updateData });

    await edit();
    await navigate();

    expect(updateData).toHaveBeenCalledExactlyOnceWith(contentApi.current?.getContent(), false);
  });

  it('does not write when the document equals the description', async () => {
    const updateData = vi.fn();
    await renderHost({ updateData });

    await navigate();

    expect(updateData).not.toHaveBeenCalled();
  });

  it('does not write when the description is null', async () => {
    const updateData = vi.fn();
    await renderHost({ description: null, updateData });

    await navigate();

    expect(updateData).not.toHaveBeenCalled();
  });
});

describe('behaviour the description sync redesign changes', () => {
  it('commits on unmount when defaultValue changed after mount, though the user never touched the document', async () => {
    const updateData = vi.fn();
    const renderEditor = (defaultValue: string) =>
      act(async () => root.render(<BlockNote id="doc" defaultValue={defaultValue} updateData={updateData} contentApiRef={contentApi} />));
    await renderEditor(stored);

    await renderEditor(otherStored);
    expect(contentApi.current?.getContent()).toBe(stored);
    await unmount();

    expect(updateData).toHaveBeenCalledExactlyOnceWith(stored);
  });

  it('commits on unmount a stored document the editor serializes differently, though the user never touched it', async () => {
    const updateData = vi.fn();
    const unnormalized = JSON.stringify([
      { id: 'p', type: 'paragraph', props: {}, content: [{ type: 'text', text: 'hello', styles: {} }], children: [] },
    ]);
    await act(async () => root.render(<BlockNote id="doc" defaultValue={unnormalized} updateData={updateData} contentApiRef={contentApi} />));

    await unmount();

    expect(updateData).toHaveBeenCalledOnce();
    expect(updateData.mock.calls[0][0]).not.toBe(unnormalized);
  });

  it('compares the navigation write against the description it mounted with', async () => {
    const updateData = vi.fn();
    await renderHost({ updateData });

    // A newer description arrives; the editor still holds the one it mounted with.
    await renderHost({ description: otherStored, updateData });
    await navigate();

    expect(updateData).not.toHaveBeenCalled();
  });

  it('writes the mounted document over a newer description on unmount, as a standalone update', async () => {
    const updateData = vi.fn();
    await renderHost({ updateData });

    await renderHost({ description: otherStored, updateData });
    await unmount();

    expect(updateData).toHaveBeenCalledExactlyOnceWith(stored, false);
  });
});
