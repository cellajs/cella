// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { blocksToYDoc } from '@blocknote/core/yjs';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { YDocWriter } from '~/modules/common/blocknote/yjs-store';
import type { UnsaveableYDocRecord } from '~/query/local-user-db';

/** The toasts shown, and the ids closed. */
const toasts = vi.hoisted(() => ({ shown: [] as { title: string; id: string; timeout?: number; description: ReactNode }[], closed: [] as string[] }));
const copyBlocksToClipboard = vi.hoisted(() => vi.fn(async (_blocks: string | null) => true));

vi.mock('~/modules/common/toaster/toaster', () => ({
  toaster: {
    warning: (title: string, options: { id: string; timeout?: number; description: ReactNode }) => toasts.shown.push({ title, ...options }),
    close: (id: string) => toasts.closed.push(id),
  },
}));
vi.mock('~/modules/common/blocknote/helpers/blocknote-helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/modules/common/blocknote/helpers/blocknote-helpers')>()),
  copyBlocksToClipboard,
}));
vi.mock('~/query/query-client', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  return { queryClient: new QueryClient() };
});
vi.mock('i18next', () => ({ default: { t: (key: string, opts?: { name?: string }) => (opts?.name ? `${key} [${opts.name}]` : key) } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const { parkUnsaveable, showUnsaveableNotice } = await import('~/modules/common/blocknote/unsaveable-notices');
const { getHeadlessEditor } = await import('~/modules/common/blocknote/helpers/blocknote-helpers');
const { bindLocalUserDb } = await import('~/query/local-user-db');
const { registerEntityQueryKeys } = await import('~/query/basic/entity-query-registry');
const { createEntityKeys } = await import('~/query/basic/create-query-keys');
const { queryClient } = await import('~/query/query-client');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

registerEntityQueryKeys('attachment', createEntityKeys('attachment'));
const db = bindLocalUserDb('user-notices');

const scope = { entityType: 'attachment', entityId: 'att-1', tenantId: 'tenant-1', organizationId: 'org-1' } as const;

/** A collaborative document holding `text` in its one paragraph, as an editor binds it. */
function documentWith(text: string) {
  // The shared headless editor is typed against a loose schema, so the block is cast.
  return blocksToYDoc(getHeadlessEditor(), [{ type: 'paragraph', content: text }] as never, 'document-store');
}

const recordOf = (doc: Y.Doc, extra: Partial<UnsaveableYDocRecord> = {}): UnsaveableYDocRecord => ({
  ...scope,
  generation: 'gen-1',
  reason: 'deleted',
  state: Y.encodeStateAsUpdate(doc),
  at: 1_000,
  ...extra,
});

/** A writer as the store builds it, parking into the real table: the row carries the document's state. */
function fakeWriter(overrides: Partial<YDocWriter> = {}): YDocWriter {
  return {
    start: vi.fn(),
    append: vi.fn(),
    prove: vi.fn(async () => {}),
    park: vi.fn(async (reason, doc) => {
      await db.unsaveableYDocs.add({ ...scope, generation: 'gen-1', reason, state: Y.encodeStateAsUpdate(doc), at: 2_000 });
    }),
    drop: vi.fn(async () => {}),
    failed: false,
    pending: false,
    ...overrides,
  };
}

let root: Root | undefined;

/** Renders the last toast's actions. */
async function renderActions() {
  const toast = toasts.shown.at(-1);
  if (!toast) throw new Error('no toast shown');
  const container = document.createElement('div');
  root = createRoot(container);
  await act(async () => root?.render(toast.description));
  return container;
}

const button = (container: HTMLElement, text: string) => {
  const found = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(text));
  if (!found) throw new Error(`no button "${text}"`);
  return found;
};

/** Waits until a toast showed: parking resolves over the database and a dynamic import. */
const untilShown = (count = 1) => vi.waitFor(() => expect(toasts.shown).toHaveLength(count));

beforeEach(async () => {
  toasts.shown.length = 0;
  toasts.closed.length = 0;
  copyBlocksToClipboard.mockClear();
  queryClient.clear();
  await db.unsaveableYDocs.clear();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.restoreAllMocks();
});

describe('the notice for edits that can never be saved', () => {
  it("Copy text puts the parked document's blocks on the clipboard, computed before the click", async () => {
    await showUnsaveableNotice(recordOf(documentWith('Text typed offline')));
    const toast = toasts.shown[0];
    expect(toast.timeout).toBe(0);

    const container = await renderActions();
    await act(async () => button(container, 'c:copy_text').click());

    expect(copyBlocksToClipboard).toHaveBeenCalledOnce();
    const blocks = JSON.parse(copyBlocksToClipboard.mock.calls[0][0] as string);
    expect(blocks[0]).toMatchObject({ type: 'paragraph', content: [{ type: 'text', text: 'Text typed offline' }] });
    expect(button(container, 'c:copied')).toBeTruthy();
  });

  it('Discard deletes the parked row and refetches the entity, whose cache holds the unsaved text', async () => {
    const doc = documentWith('Unsaved');
    const id = await db.unsaveableYDocs.add(recordOf(doc));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await showUnsaveableNotice({ ...recordOf(doc), id });
    const container = await renderActions();
    await act(async () => button(container, 'c:discard').click());

    await vi.waitFor(async () => expect(await db.unsaveableYDocs.get(id)).toBeUndefined());
    expect(toasts.closed).toEqual([`unsaveable:${id}`]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['attachment', 'detail', 'att-1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['attachment', 'list', 'org-1'] });
  });

  it("names the entity from the cache, else by the document's first line", async () => {
    await showUnsaveableNotice(recordOf(documentWith('Meeting notes'), { reason: 'denied' }));
    expect(toasts.shown[0].title).toBe('c:unsaveable_denied.text [“Meeting notes”]');

    queryClient.setQueryData(['attachment', 'detail', 'att-1'], { id: 'att-1', name: 'report.pdf' });
    await showUnsaveableNotice(recordOf(documentWith('Meeting notes'), { reason: 'replaced', at: 2 }));
    expect(toasts.shown[1].title).toBe('c:unsaveable_replaced.text [report.pdf]');
  });
});

describe('parking edits that can never be saved', () => {
  it('parks unsynced edits through the writer, and the notice discards exactly the row it parked', async () => {
    const doc = documentWith('Parked text');
    const writer = fakeWriter();
    const conn = { yDoc: doc, writer, unsynced: true, generation: 'gen-1' };

    parkUnsaveable(conn, scope, 'denied');
    expect(writer.park).toHaveBeenCalledExactlyOnceWith('denied', doc);
    expect(writer.drop).not.toHaveBeenCalled();
    await untilShown();

    const [row] = await db.unsaveableYDocs.toArray();
    expect(row).toMatchObject({ ...scope, reason: 'denied' });
    expect(toasts.shown[0].id).toBe(`unsaveable:${row.id}`);

    const container = await renderActions();
    await act(async () => button(container, 'c:copy_text').click());
    expect(JSON.parse(copyBlocksToClipboard.mock.calls[0][0] as string)[0].content[0].text).toBe('Parked text');

    await act(async () => button(container, 'c:discard').click());
    await vi.waitFor(async () => expect(await db.unsaveableYDocs.count()).toBe(0));
  });

  it('a clean document parks nothing: its stored copy goes, silently', async () => {
    const writer = fakeWriter();

    parkUnsaveable({ yDoc: documentWith('Saved'), writer, unsynced: false, generation: 'gen-1' }, scope, 'deleted');

    expect(writer.drop).toHaveBeenCalledOnce();
    expect(writer.park).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(toasts.shown).toEqual([]);
  });

  it('must not lose edits without a database: the notice holds the state in memory', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const conn = { yDoc: documentWith('Impersonated edit'), writer: null, unsynced: true, generation: null };

    parkUnsaveable(conn, scope, 'refused');
    await untilShown();
    expect(toasts.shown[0].title).toBe('c:unsaveable_refused.text [“Impersonated edit”]');

    const container = await renderActions();
    await act(async () => button(container, 'c:copy_text').click());
    expect(JSON.parse(copyBlocksToClipboard.mock.calls[0][0] as string)[0].content[0].text).toBe('Impersonated edit');

    await act(async () => button(container, 'c:discard').click());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['attachment', 'detail', 'att-1'] });
    expect(await db.unsaveableYDocs.count()).toBe(0);
  });

  it('must not lose edits whose parking failed: the notice falls back to the state it read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const writer = fakeWriter({ park: vi.fn(async () => Promise.reject(new DOMException('full', 'QuotaExceededError'))) });

    parkUnsaveable({ yDoc: documentWith('Kept anyway'), writer, unsynced: true, generation: 'gen-1' }, scope, 'deleted');
    await untilShown();

    // No row to point at: the notice is keyed by the document and when it was parked.
    expect(toasts.shown[0].id).toMatch(/^unsaveable:attachment:att-1:\d+$/);
    const container = await renderActions();
    await act(async () => button(container, 'c:copy_text').click());
    expect(JSON.parse(copyBlocksToClipboard.mock.calls[0][0] as string)[0].content[0].text).toBe('Kept anyway');
  });

  it('reads the document as it parks, so the caller may destroy it right after', async () => {
    const doc = documentWith('Read in time');
    parkUnsaveable({ yDoc: doc, writer: null, unsynced: true, generation: 'gen-1' }, scope, 'replaced');
    // The connection's rebuild clears and destroys the dropped document at once.
    doc.getXmlFragment('document-store').delete(0, doc.getXmlFragment('document-store').length);
    doc.destroy();
    await untilShown();

    const container = await renderActions();
    await act(async () => button(container, 'c:copy_text').click());
    expect(JSON.parse(copyBlocksToClipboard.mock.calls[0][0] as string)[0].content[0].text).toBe('Read in time');
  });
});
