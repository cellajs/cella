import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { redactFailedQuery, withoutFailedQuery } from './failed-query.ts';

/** Drizzle's `DrizzleQueryError` for a lookup by a secret value, with the database error as its cause. */
const failedLookup = () => {
  // Built at run time: the tests prove this value is gone.
  const secret = `secret_${randomUUID()}`;
  const cause = new Error('canceling statement due to statement timeout');
  const error = Object.assign(new Error(`Failed query: select 1 where "secret" = $1\nparams: ${secret}`, { cause }), {
    name: 'DrizzleQueryError',
    params: [secret],
  });
  return { secret, cause, error };
};

describe('withoutFailedQuery', () => {
  it('must not keep the values of a failed query via its message or stack', () => {
    const { secret, cause, error } = failedLookup();

    const safe = withoutFailedQuery(error);

    expect(safe).toBeInstanceOf(Error);
    expect(
      JSON.stringify({ ...(safe as Error), message: (safe as Error).message, stack: (safe as Error).stack }),
    ).not.toContain(secret);
    // Positive control: the name, the database's reason and the cause stay.
    expect(safe).toMatchObject({ name: 'DrizzleQueryError', message: cause.message, cause });
    expect((safe as Error).stack).toMatch(/^DrizzleQueryError: canceling statement due to statement timeout\n {4}at /);
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
