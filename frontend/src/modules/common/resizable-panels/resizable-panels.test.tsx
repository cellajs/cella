// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const { ResizablePanel, ResizablePanelGroup, ResizableSeparator } = await import('./resizable-panels');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});

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
  it('is a focusable, named, upright separator that keeps the forced-colors outline', async () => {
    const separator = await renderSeparator(<ResizableSeparator index={0} className="w-1.5" />);
    expect(separator.getAttribute('tabindex')).toBe('0');
    expect(separator.getAttribute('aria-label')).toBe('c:resize_panels');
    expect(separator.getAttribute('aria-orientation')).toBe('vertical');
    expect(separator.className).toContain('outline-hidden');
    expect(separator.className).not.toMatch(/outline-none|ring-0/);
  });

  it('takes the name its consumer passes', async () => {
    const separator = await renderSeparator(<ResizableSeparator index={1} aria-label="Resize backlog" />);
    expect(separator.getAttribute('aria-label')).toBe('Resize backlog');
  });

  it('grows the panel on its left after the panels are reordered', async () => {
    const group = (order: string[]) => (
      <ResizablePanelGroup id="group" defaultLayout={{ a: 400, b: 400 }}>
        {order.map((id, i) => (
          <div key={id}>
            <ResizablePanel id={id} minWidth={300} collapsedWidth={50} collapsible />
            {i < order.length - 1 && <ResizableSeparator index={i} />}
          </div>
        ))}
      </ResizablePanelGroup>
    );

    await renderSeparator(group(['a', 'b']));
    await act(async () => root?.render(group(['b', 'a'])));
    const separator = container.querySelector('[role="separator"]');
    await act(async () => separator?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));

    const width = (id: string) => container.querySelector<HTMLElement>(`[data-panel="${id}"]`)?.style.width;
    expect(width('b')).toBe('420px');
    expect(width('a')).toBe('380px');
  });

  it('announces its current neighbours and left width after reorders and resizes', async () => {
    const group = (order: string[]) => (
      <ResizablePanelGroup id="group" defaultLayout={{ a: 400, b: 300 }}>
        {order.flatMap((id, i) => {
          const panel = <ResizablePanel key={id} id={id} minWidth={300} collapsedWidth={50} collapsible />;
          if (i === order.length - 1) return [panel];
          // biome-ignore lint/suspicious/noArrayIndexKey: an index key keeps the separator mounted while the panels move past it
          return [panel, <ResizableSeparator key={`separator-${i}`} index={i} />];
        })}
      </ResizablePanelGroup>
    );
    const domId = (id: string) => container.querySelector(`[data-panel="${id}"]`)?.id;

    const separator = await renderSeparator(group(['a', 'b']));
    expect(separator.getAttribute('aria-controls')).toBe(`${domId('a')} ${domId('b')}`);
    expect(separator.getAttribute('aria-valuenow')).toBe('400');
    expect(separator.getAttribute('aria-valuemin')).toBe('50');
    expect(separator.getAttribute('aria-valuemax')).toBe('600');

    await act(async () => root?.render(group(['b', 'a'])));
    expect(container.querySelector('[role="separator"]')).toBe(separator);
    expect(separator.getAttribute('aria-controls')).toBe(`${domId('b')} ${domId('a')}`);
    expect(separator.getAttribute('aria-valuenow')).toBe('300');

    await act(async () => separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(separator.getAttribute('aria-valuenow')).toBe('320');
  });
});

describe('ResizablePanel', () => {
  it('marks a panel while it opens, so its hintFadeOut content fades in, and leaves a collapsing panel unmarked', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const separator = await renderSeparator(
        <ResizablePanelGroup id="group" defaultLayout={{ a: 50, b: 400 }}>
          <ResizablePanel id="a" minWidth={300} collapsedWidth={50} collapsible fade="marked" />
          <ResizableSeparator index={0} />
          <ResizablePanel id="b" minWidth={300} collapsedWidth={50} collapsible fade="marked" />
        </ResizablePanelGroup>,
      );
      const panelA = container.querySelector('[data-panel="a"]');
      const enter = () => act(async () => separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));

      await enter();
      expect(panelA?.hasAttribute('data-opening')).toBe(true);

      await act(async () => vi.advanceTimersByTime(300));
      expect(panelA?.hasAttribute('data-opening')).toBe(false);

      await enter();
      expect(panelA?.hasAttribute('data-opening')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Resize hint', () => {
  it('fades an expanding panel and draws the curtain over its neighbour by the width it takes', async () => {
    // jsdom has no pointer capture or constructable stylesheets, which a drag uses for its cursor
    HTMLElement.prototype.setPointerCapture = () => {};
    vi.stubGlobal(
      'CSSStyleSheet',
      class {
        replaceSync() {}
      },
    );
    Object.defineProperty(document, 'adoptedStyleSheets', { value: [], writable: true, configurable: true });
    const separator = await renderSeparator(
      <ResizablePanelGroup id="group" defaultLayout={{ a: 50, b: 400 }}>
        <ResizablePanel id="a" minWidth={300} collapsedWidth={50} collapsible />
        <ResizableSeparator index={0} />
        <ResizablePanel id="b" minWidth={300} collapsedWidth={50} collapsible />
      </ResizablePanelGroup>,
    );
    const panel = (id: string) => container.querySelector<HTMLElement>(`[data-panel="${id}"]`);
    const curtain = (id: string) => panel(id)?.querySelector<HTMLElement>(':scope > [data-resize-hint]');

    await act(async () => separator.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 100 })));
    // Half the 250px expand gate
    await act(async () => document.dispatchEvent(new MouseEvent('pointermove', { clientX: 225, clientY: 40 })));

    expect(panel('a')?.getAttribute('data-resizing')).toBe('expand-right');
    expect(panel('a')?.style.getPropertyValue('--content-opacity')).toBe('0.5');
    expect(curtain('a')?.style.getPropertyValue('--hint-strength')).toBe('0');

    expect(panel('b')?.getAttribute('data-resizing')).toBe('cover-left');
    expect(panel('b')?.style.getPropertyValue('--content-opacity')).toBe('');
    expect(curtain('b')?.dataset.side).toBe('left');
    expect(curtain('b')?.style.width).toBe('187.5px');
    expect(curtain('b')?.style.getPropertyValue('--hint-y')).toBe('40px');
    expect((separator as HTMLElement).style.getPropertyValue('--hint-strength')).toBe('0.75');

    await act(async () => document.dispatchEvent(new MouseEvent('pointerup')));
    expect(panel('b')?.hasAttribute('data-resizing')).toBe(false);
    expect(curtain('b')?.style.width).toBe('');
    expect((separator as HTMLElement).style.getPropertyValue('--hint-strength')).toBe('');
  });
});
