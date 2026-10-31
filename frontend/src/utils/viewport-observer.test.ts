// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { initViewportObserver } from './viewport-observer';

let frames: FrameRequestCallback[] = [];
const flushFrames = () => {
  const pending = frames;
  frames = [];
  for (const frame of pending) frame(0);
};

describe('initViewportObserver', () => {
  it('ignores browser chrome lag below keyboard size', () => {
    vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => frames.push(frame));
    // A visual viewport the test resizes; `innerHeight` stays at jsdom's 768.
    const viewport = Object.assign(new EventTarget(), { height: window.innerHeight, offsetTop: 0, scale: 1 });
    vi.stubGlobal('visualViewport', viewport);
    initViewportObserver();

    viewport.height = window.innerHeight - 60;
    viewport.dispatchEvent(new Event('resize'));
    flushFrames();

    expect(document.body.classList.contains('keyboard-open')).toBe(false);
  });

  it('keeps an open keyboard while scrolling pans the visual viewport', () => {
    vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => frames.push(frame));
    const viewport = Object.assign(new EventTarget(), { height: window.innerHeight, offsetTop: 0, scale: 1 });
    vi.stubGlobal('visualViewport', viewport);
    initViewportObserver();

    viewport.height = window.innerHeight - 300;
    viewport.dispatchEvent(new Event('resize'));
    flushFrames();
    expect(document.body.classList.contains('keyboard-open')).toBe(true);

    viewport.offsetTop = 300;
    viewport.dispatchEvent(new Event('scroll'));
    flushFrames();
    expect(document.body.classList.contains('keyboard-open')).toBe(true);
  });
});
