// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const openUserSheet = vi.fn();
vi.mock('~/modules/user/use-open-user-sheet', () => ({ useOpenUserSheet: () => openUserSheet }));

const { useMentionLinks } = await import('~/modules/user/use-mention-links');

const userId = '00000000-0000-7000-8000-000000000001';
const html = `<p><span data-mention-id="${userId}">@ Admin User</span> hi</p>`;

function Body({ html, onOuterClick }: { html: string; onOuterClick: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useMentionLinks(ref, html);
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: stands in for the card around a body
    <div onClick={onOuterClick}>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: test markup */}
      <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

const mention = () => container.querySelector<HTMLElement>('[data-mention-id]');

describe('useMentionLinks', () => {
  it('makes each mention a focusable link', async () => {
    await act(async () => root.render(<Body html={html} onOuterClick={vi.fn()} />));
    expect(mention()?.getAttribute('role')).toBe('link');
    expect(mention()?.tabIndex).toBe(0);
  });

  it('opens the user sheet on a click or Enter, and the element around it does not act', async () => {
    const onOuterClick = vi.fn();
    await act(async () => root.render(<Body html={html} onOuterClick={onOuterClick} />));

    act(() => mention()?.click());
    act(() => mention()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    act(() => mention()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })));

    expect(openUserSheet.mock.calls).toEqual([[userId], [userId]]);
    expect(onOuterClick).not.toHaveBeenCalled();
  });

  it('leaves clicks outside a mention alone', async () => {
    await act(async () => root.render(<Body html={html} onOuterClick={vi.fn()} />));
    act(() => container.querySelector('p')?.click());
    expect(openUserSheet).not.toHaveBeenCalled();
  });
});
