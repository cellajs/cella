import { describe, expect, it, vi } from 'vitest';
import { onChangeEvent, publishChangeEvent } from './sync-events';

const change = {
  kind: 'product' as const,
  action: 'create' as const,
  entityType: 'attachment',
  organizationId: 'org-1',
  channelId: null,
  subjectId: 'attachment-1',
};

describe('syncEvents', () => {
  it('isolates a throwing subscriber, so one consumer cannot break the sync flow', () => {
    const thrower = vi.fn(() => {
      throw new Error('boom');
    });
    const healthy = vi.fn();
    const offThrower = onChangeEvent(thrower);
    const offHealthy = onChangeEvent(healthy);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => publishChangeEvent(change)).not.toThrow();
    expect(healthy).toHaveBeenCalledOnce();

    consoleError.mockRestore();
    offThrower();
    offHealthy();
  });
});
