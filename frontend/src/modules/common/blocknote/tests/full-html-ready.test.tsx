// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/modules/attachment/presign-batch', () => ({ getPresignedUrlBatched: async (id: string) => id }));
vi.mock('~/modules/attachment/offline/storage-service', () => ({
  attachmentStorage: { getSharedBlobUrl: async () => null, createBlobUrlWithVariant: async () => null },
}));
vi.mock('~/modules/attachment/offline/download-service', () => ({ downloadService: { queueForDownload: vi.fn() } }));
vi.mock('~/modules/attachment/query', () => ({ findAttachmentInCache: () => undefined }));
vi.mock('~/modules/attachment/dialog/open-attachment-dialog', () => ({ openAttachmentDialog: vi.fn() }));

const { BlockNoteFullHtml } = await import('~/modules/common/blocknote/full-html');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Each test renders its own text: the first-pass HTML cache is module state shared across tests.
const paragraphs = (...texts: string[]) =>
  JSON.stringify(
    texts.map((text, i) => ({ id: `p${i}`, type: 'paragraph', props: {}, content: text ? [{ type: 'text', text, styles: {} }] : [], children: [] })),
  );

/** Lets the first pass (a microtask) and the resolved pass (a promise chain) settle. */
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

describe('BlockNoteFullHtml onReady and defaultValue changes', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const render = (defaultValue: string, onReady?: () => void) =>
    act(async () => root.render(<BlockNoteFullHtml id="doc" defaultValue={defaultValue} organizationId="org-1" onReady={onReady} />));

  afterEach(() => act(() => root.render(null)));

  it('fires onReady once per mount, on the first computed HTML, through both passes and a changed defaultValue', async () => {
    const onReady = vi.fn();
    await render(paragraphs('ready first'), onReady);
    await settle();

    expect(container.textContent).toBe('ready first');
    expect(onReady).toHaveBeenCalledOnce();

    await render(paragraphs('ready second'), onReady);
    await settle();
    expect(container.textContent).toBe('ready second');
    expect(onReady).toHaveBeenCalledOnce();

    await act(() => root.render(null));
    await render(paragraphs('ready first'), onReady);
    await settle();
    expect(onReady).toHaveBeenCalledTimes(2);
  });

  it('fires onReady once for an empty description, which has nothing to wait for', async () => {
    const onReady = vi.fn();
    await render('', onReady);
    await settle();

    expect(container.textContent).toBe('');
    expect(onReady).toHaveBeenCalledOnce();

    await render(paragraphs('filled later'), onReady);
    await settle();
    expect(onReady).toHaveBeenCalledOnce();
  });

  it('fires onReady for a document whose blocks all render nothing', async () => {
    const onReady = vi.fn();
    await render(JSON.stringify([{ id: 'x', type: 'not-a-block', props: {}, content: [], children: [] }]), onReady);
    await settle();

    expect(container.textContent).toBe('');
    expect(onReady).toHaveBeenCalledOnce();
  });

  it('fires onReady for a document of one empty paragraph, whose HTML is not empty', async () => {
    const onReady = vi.fn();
    await render(paragraphs(''), onReady);
    await settle();

    expect(container.textContent).toBe('');
    expect(onReady).toHaveBeenCalledOnce();
  });

  it('keeps the old HTML until the first pass of a changed defaultValue is ready, then replaces it', async () => {
    await render(paragraphs('old body'));
    await settle();
    expect(container.textContent).toBe('old body');

    // The changed value commits, its first pass waits for a microtask.
    act(() => root.render(<BlockNoteFullHtml id="doc" defaultValue={paragraphs('new body')} organizationId="org-1" />));
    expect(container.textContent).toBe('old body');

    await settle();
    expect(container.textContent).toBe('new body');
  });
});
