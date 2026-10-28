// @vitest-environment jsdom
import { onlineManager } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { recheckNow } = vi.hoisted(() => ({ recheckNow: vi.fn(async () => false) }));
vi.mock('~/query/offline/connectivity', () => ({ recheckNow }));

const { useOfflineAlert } = await import('~/modules/common/alerter/use-offline-alert');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Every value the hook rendered with, so a single stale frame shows up. */
const frames: boolean[] = [];

function Probe() {
  frames.push(useOfflineAlert().isShown);
  return null;
}

const setVisible = (visible: boolean) =>
  act(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: visible ? 'visible' : 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });

let root: Root;

// The blink after resume: no frame shows an alert decided before the tab was visible again, and an outage over by the last probe shows none.
describe('useOfflineAlert', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    onlineManager.setOnline(true);
    setVisible(true);
    root = createRoot(document.createElement('div'));
    act(() => root.render(<Probe />));
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it('shows once a visible tab stays offline past the delay and one more probe fails, and never on the first frame after resume', async () => {
    act(() => onlineManager.setOnline(false));
    await act(() => vi.advanceTimersByTimeAsync(1999));
    expect(frames.at(-1)).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(frames.at(-1)).toBe(true);

    // Still offline across a hide and a resume: no frame shows the alert until the delay has run again.
    setVisible(false);
    expect(frames.at(-1)).toBe(false);
    const resumedAt = frames.length;
    setVisible(true);
    await act(() => vi.advanceTimersByTimeAsync(1999));
    expect(frames.slice(resumedAt)).not.toContain(true);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(frames.at(-1)).toBe(true);

    // An outage whose last probe reaches the API ends without the alert: the probe brings the app online.
    act(() => onlineManager.setOnline(true));
    recheckNow.mockImplementationOnce(async () => {
      onlineManager.setOnline(true);
      return true;
    });
    const outageAt = frames.length;
    act(() => onlineManager.setOnline(false));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(frames.slice(outageAt)).not.toContain(true);
  });
});
