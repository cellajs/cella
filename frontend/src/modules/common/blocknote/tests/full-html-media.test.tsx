// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Presigning waits for the test, so the first pass (unresolved refs) is committed and observed on its own.
let releasePresign = () => {};
const presignGate = new Promise<void>((resolve) => {
  releasePresign = resolve;
});
const getPresignedUrlBatched = vi.fn(async (attachmentId: string) => {
  await presignGate;
  return `https://signed.example.test/${attachmentId}`;
});
vi.mock('~/modules/attachment/presign-batch', () => ({
  getPresignedUrlBatched: (attachmentId: string) => getPresignedUrlBatched(attachmentId),
}));
vi.mock('~/modules/attachment/offline/storage-service', () => ({
  attachmentStorage: { getSharedBlobUrl: async () => null, createBlobUrlWithVariant: async () => null },
}));
vi.mock('~/modules/attachment/offline/download-service', () => ({ downloadService: { queueForDownload: vi.fn() } }));
vi.mock('~/modules/attachment/query', () => ({ findAttachmentInCache: () => undefined }));
vi.mock('~/modules/attachment/dialog/open-attachment-dialog', () => ({ openAttachmentDialog: vi.fn() }));

const { BlockNoteFullHtml } = await import('~/modules/common/blocknote/full-html');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const organizationId = '0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b';
const otherOrganizationId = '0199a1b2-c3d4-7e5f-8a6b-000000000000';
const attachmentId = '0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2c';
const cdn = appConfig.s3.publicCDNUrl;
const ownKey = `${organizationId}/user-1/photo.webp`;

const image = (url: string, id: string) => ({ id, type: 'image', props: { url, name: 'image.png' }, children: [] });
const paragraph = (text: string) => ({
  id: 'text',
  type: 'paragraph',
  props: {},
  content: [{ type: 'text', text, styles: {} }],
  children: [],
});

/** Every `<img>` src the render ever placed in the DOM, first pass included. */
const watchImageSources = (root: HTMLElement) => {
  const sources: (string | null)[] = [];
  const collect = (node: Node) => {
    if (!(node instanceof Element)) return;
    const images = node.matches('img') ? [node] : [...node.querySelectorAll('img')];
    for (const img of images) sources.push(img.getAttribute('src'));
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) record.addedNodes.forEach(collect);
  });
  observer.observe(root, { childList: true, subtree: true });
  return { sources, stop: () => observer.disconnect() };
};

describe('BlockNoteFullHtml media', () => {
  const container = document.createElement('div');
  const root = createRoot(container);

  afterEach(() => act(() => root.render(null)));

  it('must not load media from outside the organization via a static document', async () => {
    const bypasses = [
      '//evil.example/pixel.png',
      'https://i.imgur.com/abc123.png',
      `${otherOrganizationId}/user-2/contract.png`,
      `${organizationId}/../${otherOrganizationId}/user-2/contract.png`,
    ];
    const document = JSON.stringify([
      ...bypasses.map((url, i) => image(url, `bypass-${i}`)),
      image(ownKey, 'own-key'),
      image(attachmentId, 'attachment'),
      paragraph('text survives'),
    ]);
    const watcher = watchImageSources(container);

    const sourcesNow = () => [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    // A refused reference renders nothing at all: no image, no empty file placeholder.
    const imageBlockCount = () => container.querySelectorAll('[data-content-type="image"]').length;

    await act(async () =>
      root.render(
        <BlockNoteFullHtml id="doc" defaultValue={document} tenantId="tenant-1" organizationId={organizationId} />,
      ),
    );
    // First pass: the unresolved blocks, painted while the presign is pending.
    await vi.waitFor(() => expect(container.textContent).toContain('text survives'));
    expect(sourcesNow()).toEqual([ownKey, attachmentId]);
    expect(imageBlockCount()).toBe(2);

    // The resolved pass swaps in the presigned URL, the last source to arrive.
    await act(async () => releasePresign());
    await vi.waitFor(() => expect(sourcesNow()).toContain(`https://signed.example.test/${attachmentId}`));
    watcher.stop();

    expect(sourcesNow()).toEqual([`${cdn}/${ownKey}`, `https://signed.example.test/${attachmentId}`]);
    expect(imageBlockCount()).toBe(2);
    // No render pass, first or resolved, ever held an <img> for a refused reference.
    expect(watcher.sources.filter((src) => bypasses.some((ref) => src?.includes(ref)))).toEqual([]);
  });
});
