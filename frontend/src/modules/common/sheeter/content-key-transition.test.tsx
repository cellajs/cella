// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ContentKeyTransition } from '~/modules/common/sheeter/sheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  container.dataset.slot = 'scroll-area-viewport';
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const render = (contentKey: string, text: string) =>
  act(async () =>
    root.render(
      <ContentKeyTransition contentKey={contentKey}>
        <p>{text}</p>
      </ContentKeyTransition>,
    ),
  );

const wait = (ms: number) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));

describe('ContentKeyTransition', () => {
  it('lets the old content leave at its scroll position, then starts the new content at the top', async () => {
    await render('notifications', 'Notifications');
    container.scrollTop = 500;

    await render('account', 'Account');
    expect(container.textContent).toBe('Notifications');
    expect(container.scrollTop).toBe(500);

    await wait(500);
    expect(container.textContent).toBe('Account');
    expect(container.scrollTop).toBe(0);
  });

  it('keeps the scroll position when the content re-renders under the same key', async () => {
    await render('account', 'Account');
    container.scrollTop = 500;

    await render('account', 'Account updated');

    expect(container.textContent).toBe('Account updated');
    expect(container.scrollTop).toBe(500);
  });
});
