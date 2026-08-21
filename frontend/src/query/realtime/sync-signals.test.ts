import { describe, expect, it, vi } from 'vitest';
import { onChangeEvent, onSyncedRows, publishChangeEvent, publishSyncedRows } from './sync-signals';

const change = {
  kind: 'product' as const,
  action: 'create' as const,
  entityType: 'attachment',
  organizationId: 'org-1',
  channelId: null,
  subjectId: 'attachment-1',
};

const rows = {
  entityType: 'attachment' as const,
  organizationId: 'org-1',
  rows: [{ id: 'attachment-1' }],
  degraded: false,
};

describe('syncSignals', () => {
  it('delivers change events to every subscriber', () => {
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = onChangeEvent(first);
    const offSecond = onChangeEvent(second);

    publishChangeEvent(change);

    expect(first).toHaveBeenCalledWith(change);
    expect(second).toHaveBeenCalledWith(change);
    offFirst();
    offSecond();
  });

  it('keeps the two signals separate, so a trigger cannot be mistaken for row data', () => {
    const changeHandler = vi.fn();
    const rowsHandler = vi.fn();
    const offChange = onChangeEvent(changeHandler);
    const offRows = onSyncedRows(rowsHandler);

    publishChangeEvent(change);
    expect(rowsHandler).not.toHaveBeenCalled();

    publishSyncedRows(rows);
    expect(changeHandler).toHaveBeenCalledTimes(1);
    expect(rowsHandler).toHaveBeenCalledWith(rows);

    offChange();
    offRows();
  });

  it('stops delivering once unsubscribed', () => {
    const handler = vi.fn();
    onChangeEvent(handler)();

    publishChangeEvent(change);

    expect(handler).not.toHaveBeenCalled();
  });

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
