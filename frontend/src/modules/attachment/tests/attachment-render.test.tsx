// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

// react-pdf throws a load failure during render: it loads the document through Suspense
vi.mock('~/modules/attachment/render/pdf', () => ({
  RenderPDF: () => {
    throw new Error('Failed to fetch');
  },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const { AttachmentRender } = await import('~/modules/attachment/render/attachment-render');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
});

describe('AttachmentRender', () => {
  it('shows the download placeholder in the viewer when the PDF cannot load', async () => {
    // React reports an error a boundary caught; the test only needs what renders
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const container = document.createElement('div');
    root = createRoot(container);

    await act(async () => {
      root?.render(<AttachmentRender type="application/pdf" url="https://files.example.com/notes.pdf" filename="notes.pdf" />);
    });
    await vi.waitFor(() => expect(container.textContent).toContain('c:download_to_view'));

    expect(container.querySelector('button')?.textContent).toBe('c:download');
    consoleError.mockRestore();
  });
});
