// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResolvableItem } from '~/modules/attachment/hooks/use-resolved-attachments';

const { resolveAttachmentUrl } = vi.hoisted(() => ({ resolveAttachmentUrl: vi.fn() }));
vi.mock('~/modules/attachment/helpers/resolve-url', () => ({ resolveAttachmentUrl }));
vi.mock('~/modules/attachment/query', () => ({ findAttachmentInCache: () => undefined }));
vi.mock('~/modules/attachment/helpers/pending-uploads', () => ({ PendingUploadError: class extends Error {}, getPendingUpload: () => undefined }));
vi.mock('~/modules/attachment/presign-batch', () => ({ PresignRejectedError: class extends Error {} }));

const { useResolvedAttachments } = await import('~/modules/attachment/hooks/use-resolved-attachments');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let renders: ReturnType<typeof useResolvedAttachments>[] = [];

function Probe({ items }: { items: ResolvableItem[] }) {
  renders.push(useResolvedAttachments(items));
  return null;
}

let root: Root | undefined;

describe('useResolvedAttachments', () => {
  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    renders = [];
  });

  it('reads as loading, not as not found, when a fetched row brings the keys an id-only item lacked', async () => {
    // Only a row with storage keys has a cloud URL: an id alone resolves to nothing, as on a cold dialog open.
    resolveAttachmentUrl.mockImplementation(async (_id: string, meta: unknown) => (meta ? { url: 'https://cdn.test/a', isLocal: false } : null));
    root = createRoot(document.createElement('div'));

    await act(async () => root?.render(<Probe items={[{ id: 'a' }]} />));
    expect(renders.at(-1)).toMatchObject({ isLoading: false, errorIds: ['a'] });

    const fetched: ResolvableItem = {
      id: 'a',
      name: 'a',
      keys: { original: 'files/a.png' },
      publicBucket: true,
      organizationId: 'org',
      tenantId: 'tenant',
    };
    const firstAfterFetch = renders.length;
    await act(async () => root?.render(<Probe items={[fetched]} />));

    expect(renders[firstAfterFetch]).toMatchObject({ isLoading: true });
    expect(renders.at(-1)).toMatchObject({ isLoading: false, errorIds: [], items: [{ id: 'a', url: 'https://cdn.test/a' }] });
  });
});
