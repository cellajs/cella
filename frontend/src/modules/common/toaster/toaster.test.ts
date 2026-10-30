import type { ToastManagerEvent } from '@base-ui/react/toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toaster, toastManager } from '~/modules/common/toaster/toaster';
import { uiStore } from '~/modules/ui/ui-store';

// Stands in for the Toaster: the Base UI provider subscribes the same way.
let events: ToastManagerEvent[] = [];
let unsubscribe: (() => void) | undefined;

const subscribe = () => {
  unsubscribe = toastManager[' subscribe']((event) => events.push(event));
};

describe('toaster', () => {
  beforeEach(() => {
    events = [];
  });

  afterEach(() => {
    unsubscribe?.();
    unsubscribe = undefined;
    toaster.close();
    uiStore.setState({ contrast: 'system' });
    vi.unstubAllGlobals();
  });

  // The accessibility statement promises it: with more contrast, messages stay until closed, also before sign-in
  it('keeps a toast open when its call asks for it or more contrast is on, by setting or by device', () => {
    subscribe();

    toaster.success('Saved');
    toaster('New version', { timeout: 0 });
    uiStore.setState({ contrast: 'more' });
    toaster.error('Upload failed', { timeout: 8_000 });
    uiStore.setState({ contrast: 'system' });
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-contrast: more)' }));
    toaster.success('Copied');

    const adds = events.filter(({ action }) => action === 'add');
    const [closesItself, ...kept] = adds.map((event) => event.options.timeout);
    expect(closesItself).toBeGreaterThan(0);
    expect(kept).toEqual([0, 0, 0]);
  });

  it('keeps explicit ids and leaves the id of a non-string message to Base UI', () => {
    subscribe();

    expect(toaster.warning('Saved', { id: 'save-operation' })).toBe('save-operation');
    const id = toaster.warning(null);

    expect(id).not.toMatch(/^toast:/);
    expect(events[1].options).toMatchObject({ id, title: null });
  });

  // Fast toggling left the first message on top: Base UI updates a known id where it stands
  it('closes a repeated message that another toast covers, so its add lands on top', () => {
    subscribe();

    toaster.success('Entered');
    toaster.success('Left');
    events = [];

    toaster.success('Left');
    expect(events.map(({ action }) => action)).toEqual(['add']);

    events = [];
    toaster.success('Entered');
    expect(events.map(({ action, options }) => [action, options.id])).toEqual([
      ['close', 'toast:Entered'],
      ['add', 'toast:Entered'],
    ]);
  });

  // The reload prompt re-shows itself under its id, and closing it would fire its onClose
  it('leaves a covered toast with an explicit id in place', () => {
    subscribe();

    toaster('Reload', { id: 'reload' });
    toaster.success('Saved');
    events = [];

    toaster('Reloading', { id: 'reload' });
    expect(events.map(({ action }) => action)).toEqual(['add']);
  });

  it('holds toasts shown before a toaster subscribes and replays them on subscribe', () => {
    toaster.warning('Offline cache miss');
    toaster.error('Dropped', { id: 'dropped' });
    toaster.close('dropped');
    expect(events).toHaveLength(0);

    subscribe();

    expect(events.map(({ action, options }) => [action, options.id])).toEqual([['add', 'toast:Offline cache miss']]);
  });
});
