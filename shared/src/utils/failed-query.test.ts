import { describe, expect, it } from 'vitest';
import { failedLookup } from '../testing/telemetry.ts';
import { redactFailedQuery, withoutFailedQuery } from './failed-query.ts';

describe('withoutFailedQuery', () => {
  it('must not keep the values of a failed query via its message or stack', () => {
    const { secret, reason, error } = failedLookup();

    const safe = withoutFailedQuery(error);

    expect(safe).toBeInstanceOf(Error);
    expect(
      JSON.stringify({ ...(safe as Error), message: (safe as Error).message, stack: (safe as Error).stack }),
    ).not.toContain(secret);
    // Positive control: the name, the database's reason and the cause stay.
    expect(safe).toMatchObject({ name: 'DrizzleQueryError', message: reason, cause: error.cause });
    expect((safe as Error).stack).toMatch(new RegExp(`^DrizzleQueryError: ${reason}\n {4}at `));
  });

  it('returns any other thrown value as it is', () => {
    const error = new Error('Failed query without values');
    expect(withoutFailedQuery(error)).toBe(error);
    expect(withoutFailedQuery('text')).toBe('text');
  });
});

describe('redactFailedQuery', () => {
  it('must not keep the values of a failed query via a stack that quotes it', () => {
    const { secret, error } = failedLookup();
    const stack = `Error: Could not sign in\n${error.stack}`;

    const redacted = redactFailedQuery(stack);

    expect(redacted).not.toContain(secret);
    // Positive control: the frames after the quoted query survive.
    expect(redacted).toMatch(/Failed query: \[REDACTED\]\n {4}at /);
  });
});
