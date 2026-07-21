import { describe, expect, it } from 'vitest';
import { isStalePublicationError } from '../pipeline/replication-errors';

describe('isStalePublicationError', () => {
  it('detects the stale-publication decode error', () => {
    expect(isStalePublicationError(new Error('publication "cdc_pub" does not exist'))).toBe(true);
    // pg errors are plain objects with a message in some code paths.
    expect(isStalePublicationError({ message: 'publication "cdc_pub" does not exist' } as Error)).toBe(true);
  });

  it('ignores unrelated replication errors', () => {
    expect(isStalePublicationError(new Error('replication slot "cdc_slot" is active for PID 123'))).toBe(false);
    expect(isStalePublicationError(new Error('relation "users" does not exist'))).toBe(false);
    expect(isStalePublicationError(null)).toBe(false);
    expect(isStalePublicationError(undefined)).toBe(false);
  });
});
