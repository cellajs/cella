// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initTextEditingObserver } from './text-editing-observer';

let frames: FrameRequestCallback[] = [];
const flushFrames = () => {
  const pending = frames;
  frames = [];
  for (const frame of pending) frame(0);
};

const isMarked = () => document.body.classList.contains('text-editing');

const start = (coarse: boolean) => {
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => frames.push(frame));
  vi.stubGlobal('matchMedia', () => ({ matches: coarse }));
  initTextEditingObserver();
};

const addElement = (html: string) => {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const element = holder.firstElementChild as HTMLElement;
  document.body.append(element);
  return element;
};

// jsdom does not implement isContentEditable
Object.defineProperty(HTMLElement.prototype, 'isContentEditable', {
  get(this: HTMLElement) {
    return this.hasAttribute('contenteditable');
  },
});

describe('initTextEditingObserver', () => {
  afterEach(() => {
    document.body.replaceChildren();
    document.body.classList.remove('text-editing');
  });

  it('marks a focused textarea and contenteditable on a touch device', () => {
    start(true);
    addElement('<textarea></textarea>').focus();
    expect(isMarked()).toBe(true);

    addElement('<div contenteditable="true" tabindex="0"></div>').focus();
    expect(isMarked()).toBe(true);
  });

  it('leaves a single-line input and a read-only textarea unmarked', () => {
    start(true);
    addElement('<input type="text" />').focus();
    expect(isMarked()).toBe(false);

    addElement('<textarea readonly></textarea>').focus();
    expect(isMarked()).toBe(false);
  });

  it('leaves a fine pointer unmarked', () => {
    start(false);
    addElement('<textarea></textarea>').focus();
    expect(isMarked()).toBe(false);
  });

  it('unmarks a frame after focus leaves, and stays marked when focus moves to another editor', () => {
    start(true);
    const first = addElement('<textarea></textarea>');
    const second = addElement('<textarea></textarea>');
    first.focus();

    second.focus();
    flushFrames();
    expect(isMarked()).toBe(true);

    second.blur();
    expect(isMarked()).toBe(true);
    flushFrames();
    expect(isMarked()).toBe(false);
  });
});
