// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PullToRefresh } from '~/modules/common/pull-to-refresh';
import { useUIStore } from '~/modules/ui/ui-store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

beforeEach(async () => {
  useUIStore.setState({ uiLocks: [] });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <PullToRefresh onRefresh={vi.fn()} />
      </QueryClientProvider>,
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

/** Dispatches a touch event on the window; jsdom has no Touch constructor, so the touch list is a plain array. */
async function touch(type: string, y?: number) {
  const event = new Event(type, { bubbles: true });
  const touches = y === undefined ? [] : [{ clientY: y, screenY: y }];
  Object.defineProperty(event, 'targetTouches', { value: touches });
  await act(async () => document.body.dispatchEvent(event));
}

const isIndicatorShown = () => !!container.querySelector('title');

describe('pull to refresh', () => {
  it('drops a pull the browser cancels', async () => {
    await touch('touchstart', 10);
    await touch('touchmove', 200);
    expect(isIndicatorShown()).toBe(true);
    expect(document.body.classList.contains('overflow-hidden')).toBe(true);

    await touch('touchcancel');

    expect(isIndicatorShown()).toBe(false);
    expect(document.body.classList.contains('overflow-hidden')).toBe(false);
  });

  it('drops a pull when an overlay opens mid-pull', async () => {
    await touch('touchstart', 10);
    await touch('touchmove', 200);

    await act(async () => useUIStore.getState().lockUI('sheeter'));

    expect(isIndicatorShown()).toBe(false);
    expect(document.body.classList.contains('overflow-hidden')).toBe(false);
  });

  it('starts no pull while an overlay is open', async () => {
    await act(async () => useUIStore.getState().lockUI('sheeter'));

    await touch('touchstart', 10);
    await touch('touchmove', 200);

    expect(isIndicatorShown()).toBe(false);
  });
});
