// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initViewportObserver } from '~/utils/viewport-observer';

let frames: FrameRequestCallback[] = [];
const flushFrames = () => {
  const pending = frames;
  frames = [];
  for (const frame of pending) frame(0);
};

/** A visual viewport the test resizes; `innerHeight` stays at jsdom's 768. */
const fakeViewport = () => {
  const viewport = Object.assign(new EventTarget(), { height: window.innerHeight, offsetTop: 0, scale: 1 });
  vi.stubGlobal('visualViewport', viewport);
  const resize = (patch: Partial<Pick<typeof viewport, 'height' | 'offsetTop' | 'scale'>>) => {
    Object.assign(viewport, patch);
    viewport.dispatchEvent(new Event('resize'));
    flushFrames();
  };
  return resize;
};

const isOpen = () => document.body.classList.contains('keyboard-open');

describe('initViewportObserver', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => frames.push(frame));
    document.body.classList.remove('keyboard-open');
  });

  it('marks a keyboard-sized occlusion open and clears it once the keyboard leaves', () => {
    const resize = fakeViewport();
    initViewportObserver();
    flushFrames();
    expect(isOpen()).toBe(false);

    resize({ height: 400 });
    expect(isOpen()).toBe(true);

    resize({ height: window.innerHeight });
    expect(isOpen()).toBe(false);
  });

  it('ignores browser chrome lag below keyboard size', () => {
    const resize = fakeViewport();
    initViewportObserver();
    resize({ height: window.innerHeight - 60 });
    expect(isOpen()).toBe(false);
  });

  it('ignores a pinch zoom, which shrinks the visual viewport without a keyboard', () => {
    const resize = fakeViewport();
    initViewportObserver();
    resize({ height: 300, scale: 2 });
    expect(isOpen()).toBe(false);
  });
});
