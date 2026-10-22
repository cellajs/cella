import { describe, expect, it } from 'vitest';
import { windowStart } from './run-digest';

// The process time zone decides how JavaScript reads zone-less text; Postgres compares the column as
// UTC. The expectations hold in any zone, so a run outside UTC (TZ=Europe/Amsterdam) catches a local read.
describe('digest windowStart', () => {
  const now = new Date(Date.UTC(2026, 9, 1, 12));

  it('starts at the stored lastDigestAt, ISO text like every timestamp', () => {
    const start = windowStart({ digest: 'daily', lastDigestAt: '2026-10-01T05:00:00.123Z' }, now);
    expect(start.toISOString()).toBe('2026-10-01T05:00:00.123Z');
  });

  it('starts no earlier than the cadence plus a day', () => {
    const start = windowStart({ digest: 'weekly', lastDigestAt: '2026-08-01T05:00:00.000Z' }, now);
    expect(start.toISOString()).toBe('2026-09-23T12:00:00.000Z');
  });
});
