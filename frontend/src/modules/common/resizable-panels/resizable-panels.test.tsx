// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const { ResizableSeparator } = await import('./resizable-panels');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

async function renderSeparator(node: ReactNode) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  const separator = container.querySelector('[role="separator"]');
  if (!separator) throw new Error('no separator rendered');
  return separator;
}

// No template page renders the board, so the accessibility audit never visits this control.
describe('ResizableSeparator', () => {
  it('is a focusable, named, upright separator that keeps the focus ring', async () => {
    const separator = await renderSeparator(<ResizableSeparator index={0} className="w-1.5" />);
    expect(separator.getAttribute('tabindex')).toBe('0');
    expect(separator.getAttribute('aria-label')).toBe('c:resize_panels');
    expect(separator.getAttribute('aria-orientation')).toBe('vertical');
    expect(separator.className).toContain('focus-effect');
    expect(separator.className).not.toMatch(/outline-hidden|ring-0/);
  });

  it('takes the name its consumer passes', async () => {
    const separator = await renderSeparator(<ResizableSeparator index={1} aria-label="Resize backlog" />);
    expect(separator.getAttribute('aria-label')).toBe('Resize backlog');
  });
});
