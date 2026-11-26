// @vitest-environment jsdom
import { onlineManager } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOfflineMark } from '~/modules/navigation/use-offline-mark';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Every value the hook rendered with, so a single stale frame shows up. */
const frames: boolean[] = [];

function Probe() {
  frames.push(useOfflineMark());
  return null;
}

const setVisible = (visible: boolean) =>
  act(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: visible ? 'visible' : 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });

let root: Root;

// The blink after resume: no frame shows a mark decided before the tab was visible again, nor one within the resume grace.
describe('useOfflineMark', () => {
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

  it('shows once a visible tab stays offline past the delay, and never within the grace after resume', async () => {
    act(() => onlineManager.setOnline(false));
    await act(() => vi.advanceTimersByTimeAsync(1999));
    expect(frames.at(-1)).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(frames.at(-1)).toBe(true);

    // Still offline across a hide and a resume: no frame shows the mark until the grace has run.
    setVisible(false);
    expect(frames.at(-1)).toBe(false);
    const resumedAt = frames.length;
    setVisible(true);
    await act(() => vi.advanceTimersByTimeAsync(9999));
    expect(frames.slice(resumedAt)).not.toContain(true);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(frames.at(-1)).toBe(true);

    // Back online hides it at once; an outage once the grace is over waits the delay alone.
    act(() => onlineManager.setOnline(true));
    expect(frames.at(-1)).toBe(false);
    act(() => onlineManager.setOnline(false));
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(frames.at(-1)).toBe(true);
  });
});
