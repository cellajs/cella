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

/** Lets the first pass (a microtask) and the resolved pass (a promise chain) settle. */
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

describe('BlockNoteFullHtml onReady', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const render = (defaultValue: string, onReady?: () => void) =>
    act(async () => root.render(<BlockNoteFullHtml id="doc" defaultValue={defaultValue} organizationId="org-1" onReady={onReady} />));

  afterEach(() => act(() => root.render(null)));

  it('fires onReady for a document with nothing to show: an empty description, or blocks that all render nothing', async () => {
    const onEmpty = vi.fn();
    await render('', onEmpty);
    await settle();
    expect(container.textContent).toBe('');
    expect(onEmpty).toHaveBeenCalledOnce();

    await act(() => root.render(null));
    const onUnrenderable = vi.fn();
    await render(JSON.stringify([{ id: 'x', type: 'not-a-block', props: {}, content: [], children: [] }]), onUnrenderable);
    await settle();
    expect(container.textContent).toBe('');
    expect(onUnrenderable).toHaveBeenCalledOnce();
  });
});
