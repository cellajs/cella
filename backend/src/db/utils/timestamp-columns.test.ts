import { describe, expect, it } from 'vitest';
import { toIsoTimestamp } from './timestamp-columns';

// The wire contract every client parses: a timestamp is ISO 8601 UTC text, whatever the driver handed over.
describe('toIsoTimestamp', () => {
  it('reads timestamptz text, with any offset and up to microseconds, as the same UTC instant', () => {
    expect(toIsoTimestamp('2026-10-22 10:00:00.123+00')).toBe('2026-10-22T10:00:00.123Z');
    expect(toIsoTimestamp('2026-10-22 12:00:00.123456+02:00')).toBe('2026-10-22T10:00:00.123Z');
    expect(toIsoTimestamp('2026-10-22 10:00:00+00')).toBe('2026-10-22T10:00:00.000Z');
  });

  it('reads text without a zone (a partition key column) as UTC', () => {
    expect(toIsoTimestamp('2026-10-22 10:00:00.5')).toBe('2026-10-22T10:00:00.500Z');
  });

  it('hands ISO text through unchanged, and text that is no instant', () => {
    expect(toIsoTimestamp('2026-10-22T10:00:00.123Z')).toBe('2026-10-22T10:00:00.123Z');
    expect(toIsoTimestamp('infinity')).toBe('infinity');
  });
});
