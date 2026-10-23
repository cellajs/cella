// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const { ResizablePanel, ResizablePanelGroup, ResizableSeparator } = await import('~/modules/common/resizable-panels/resizable-panels');

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

  it('resizes and announces its current neighbours after the panels are reordered', async () => {
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
    const panel = (id: string) => container.querySelector<HTMLElement>(`[data-panel="${id}"]`);

    const separator = await renderSeparator(group(['a', 'b']));
    await act(async () => root?.render(group(['b', 'a'])));
    expect(separator.getAttribute('aria-controls')).toBe(`${panel('b')?.id} ${panel('a')?.id}`);
    expect(separator.getAttribute('aria-valuenow')).toBe('300');

    await act(async () => separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(panel('b')?.style.width).toBe('320px');
    expect(panel('a')?.style.width).toBe('380px');
    expect(separator.getAttribute('aria-valuenow')).toBe('320');
  });
});
