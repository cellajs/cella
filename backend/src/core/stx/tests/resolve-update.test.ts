import { describe, expect, it } from 'vitest';
import { compareHLC } from '#/core/stx/hlc';
import { resolveUpdateOps } from '#/core/stx/resolve-update';

const storedHLC = '1800000000000:0001:ccccc';
const entity = {
  id: 'a1',
  name: 'stored',
  stx: { mutationId: 'm0', sourceId: 's0', fieldTimestamps: { name: storedHLC } },
};
// Older than the stored value: a device whose wall clock runs behind.
const staleClientHLC = '1700000000000:0001:aaaaa';

describe('resolveUpdateOps write ordering', () => {
  it('online: accepts a write whose client timestamp is behind the stored value, stamped with a newer server HLC', () => {
    const resolved = resolveUpdateOps(
      'attachment',
      entity,
      { name: 'live edit' },
      { mutationId: 'm1', sourceId: 'tab-1', fieldTimestamps: { name: staleClientHLC } },
    );
    if (!resolved.changed) throw new Error('expected the live edit to be accepted');
    expect(resolved.values).toEqual({ name: 'live edit' });
    expect(compareHLC(resolved.stx.fieldTimestamps.name, storedHLC)).toBe(1);
    // Idempotency and echo recognition keep the client's identity.
    expect(resolved.stx.mutationId).toBe('m1');
    expect(resolved.stx.sourceId).toBe('tab-1');
  });

  it('replayed: keeps client timestamps as intent time, so a stale replay loses', () => {
    const resolved = resolveUpdateOps(
      'attachment',
      entity,
      { name: 'queued while offline' },
      { mutationId: 'm1', sourceId: 'tab-1', fieldTimestamps: { name: staleClientHLC }, replayed: true },
    );
    expect(resolved.changed).toBe(false);
  });

  it('replayed: a newer intent time still wins and is stored as sent', () => {
    const newerHLC = '1900000000000:0001:aaaaa';
    const resolved = resolveUpdateOps(
      'attachment',
      entity,
      { name: 'queued after' },
      { mutationId: 'm1', sourceId: 'tab-1', fieldTimestamps: { name: newerHLC }, replayed: true },
    );
    if (!resolved.changed) throw new Error('expected the newer replay to be accepted');
    expect(resolved.stx.fieldTimestamps.name).toBe(newerHLC);
  });
});
