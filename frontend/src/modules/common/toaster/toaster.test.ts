import type { ToastManagerEvent } from '@base-ui/react/toast';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toaster, toastManager } from '~/modules/common/toaster/toaster';

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
  });

  it('gives string messages a stable id so repeats refresh one toast', () => {
    subscribe();

    expect(toaster('Saved')).toBe('toast:Saved');
    expect(toaster.success('Saved')).toBe('toast:Saved');
    expect(events.map((event) => event.options)).toMatchObject([
      { id: 'toast:Saved', title: 'Saved', type: undefined, priority: 'low' },
      { id: 'toast:Saved', title: 'Saved', type: 'success', priority: 'low' },
    ]);
  });

  it('sets the severity as type, announces errors urgently and forwards options', () => {
    subscribe();

    toaster.info('Delete denied', { description: 'Attachment kept', timeout: 8_000 });
    toaster.error('Upload failed');

    expect(events.map((event) => event.options)).toMatchObject([
      { title: 'Delete denied', type: 'info', description: 'Attachment kept', timeout: 8_000 },
      { title: 'Upload failed', type: 'error', priority: 'high' },
    ]);
  });

  it('keeps explicit ids and leaves the id of a non-string message to Base UI', () => {
    subscribe();

    expect(toaster.warning('Saved', { id: 'save-operation' })).toBe('save-operation');
    const id = toaster.warning(null);

    expect(id).not.toMatch(/^toast:/);
    expect(events[1].options).toMatchObject({ id, title: null });
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
