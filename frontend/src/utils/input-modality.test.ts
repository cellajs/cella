// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pointerDown = (pointerType: string) => {
  const event = new Event('pointerdown');
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  window.dispatchEvent(event);
};

const load = async (coarse: boolean) => {
  vi.resetModules();
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: coarse && query === '(pointer: coarse)' }));
  const modality = await import('~/utils/input-modality');
  modality.initInputModality();
  return modality;
};

describe('isTouchInteraction', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to the primary pointer before any input', async () => {
    expect((await load(true)).isTouchInteraction()).toBe(true);
    expect((await load(false)).isTouchInteraction()).toBe(false);
  });

  it('follows the latest pointer over the primary pointer', async () => {
    const { isTouchInteraction } = await load(false);
    pointerDown('touch');
    expect(isTouchInteraction()).toBe(true);
    pointerDown('mouse');
    expect(isTouchInteraction()).toBe(false);
    pointerDown('pen');
    expect(isTouchInteraction()).toBe(true);
  });

  it('counts a key press as a hardware keyboard', async () => {
    const { isTouchInteraction } = await load(true);
    pointerDown('touch');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    expect(isTouchInteraction()).toBe(false);
  });
});
