// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Highlighting fails, so the viewer takes its plain-text fallback.
vi.mock('@shikijs/core', () => ({ createHighlighterCore: () => Promise.reject(new Error('highlighter unavailable')) }));
vi.mock('@shikijs/engine-javascript/raw', () => ({ createJavaScriptRawEngine: () => ({}) }));

const { CodeViewer } = await import('~/modules/docs/code-viewer');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('CodeViewer', () => {
  const container = document.createElement('div');
  const root = createRoot(container);

  afterEach(() => act(() => root.render(null)));

  it('must not render markup from the code via the unhighlighted fallback', async () => {
    const code = 'const note = "<img src=x onerror=alert(1)>";';
    await act(async () => root.render(<CodeViewer code={code} />));
    await vi.waitFor(() => expect(container.querySelector('code')).not.toBeNull());

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('code')?.textContent).toBe(code);
  });
});
