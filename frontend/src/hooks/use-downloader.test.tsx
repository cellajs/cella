// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('~/modules/common/toaster/toaster', () => ({ toaster: { error: toastError } }));

const { useDownloader } = await import('~/hooks/use-downloader');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let downloader: ReturnType<typeof useDownloader>;

function Probe() {
  downloader = useDownloader();
  return null;
}

let root: Root | undefined;

/** Renders the hook with `fetch` answering `response`, and records the links it clicks. */
function setup(response: Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response),
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:file');
  const clicked: { download: string; href: string }[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ download: this.download, href: this.href });
  });
  root = createRoot(document.createElement('div'));
  act(() => root?.render(<Probe />));
  return clicked;
}

describe('useDownloader', () => {
  afterEach(() => {
    act(() => root?.unmount());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports a failed response in error and saves nothing', async () => {
    const clicked = setup(new Response('gone', { status: 404, statusText: 'Not Found' }));
    await act(() => downloader.download('https://cdn.example.com/a.pdf', 'report.pdf'));

    expect(clicked).toEqual([]);
    expect(toastError).toHaveBeenCalledTimes(1);
  });
});
