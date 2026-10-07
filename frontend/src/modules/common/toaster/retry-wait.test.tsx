// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RetryWait } from '~/modules/common/toaster/retry-wait';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: { count?: number }) => (options?.count === undefined ? key : `${key}:${options.count}`) }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement;

const pass = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));

describe('RetryWait', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('counts the minutes down while it stays mounted and says when the wait is over', async () => {
    await act(async () => root?.render(<RetryWait until={Date.now() + 200_000} />));
    expect(container.textContent).toBe('c:retry_in_minutes:4');

    await pass(30_000);
    expect(container.textContent).toBe('c:retry_in_minutes:3');

    await pass(120_000);
    expect(container.textContent).toBe('c:retry_in_minutes:1');

    await pass(60_000);
    expect(container.textContent).toBe('c:retry_now');
  });
});
