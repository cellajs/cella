import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createLog } from './pino.ts';
import { collectingLogger, failedLookup } from './testing/telemetry.ts';

describe('createLogger', () => {
  it('must not leak a secret via a logged key or a logged url', () => {
    const { logger, lines, parsed } = collectingLogger(['token', '*.token']);

    logger.info({
      msg: 'request',
      url: '/api/auth/invoke-token/magic/path_secret?page=2&state=query_secret',
      token: 'root_secret',
      meta: { token: 'nested_secret', provider: 'github' },
      userId: 'u1',
    });

    const written = lines.join('\n');
    for (const secret of ['path_secret', 'query_secret', 'root_secret', 'nested_secret']) {
      expect(written).not.toContain(secret);
    }
    const [line = {}] = parsed();
    expect(line.url).toBe('/api/auth/invoke-token/magic/[REDACTED]?page=2&state=[REDACTED]');
    expect(line.token).toBe('[REDACTED]');
    // Positive control: the rest of the line survives.
    expect(line.userId).toBe('u1');
    expect(line.meta).toEqual({ token: '[REDACTED]', provider: 'github' });
  });

  it('must not log a token via a message or an error message', () => {
    const { logger, lines, parsed } = collectingLogger([]);
    // Built at run time: the test proves these values never reach a log line.
    const [codeSecret, pathSecret, causeSecret] = [randomUUID(), randomUUID(), randomUUID()];
    const cause = new Error(`GET https://app.example/me/unsubscribe?token=${causeSecret} answered 502`);

    createLog(logger).warn(`OAuth callback https://app.example/auth/github/callback?code=${codeSecret} failed`, {
      err: new Error(`fetch /api/auth/invoke-token/magic/${pathSecret} failed`, { cause }),
    });

    const written = lines.join('\n');
    for (const secret of [codeSecret, pathSecret, causeSecret]) expect(written).not.toContain(secret);
    // Positive control: the routes and the rest of the text survive.
    const [line] = parsed();
    expect(line?.msg).toBe('OAuth callback https://app.example/auth/github/callback?code=[REDACTED] failed');
    expect(line?.err).toMatchObject({
      message: 'fetch /api/auth/invoke-token/magic/[REDACTED] failed',
      cause: { message: 'GET https://app.example/me/unsubscribe?token=[REDACTED] answered 502' },
    });
  });

  it('censors through the level facade the services log with', () => {
    const { logger, parsed } = collectingLogger(['token', '*.token']);

    createLog(logger).warn('oauth callback failed', { token: 'facade_secret', url: '/cb?code=code_secret' });

    const [line] = parsed();
    expect(JSON.stringify(line)).not.toMatch(/facade_secret|code_secret/);
    expect(line?.msg).toBe('oauth callback failed');
  });
});

describe('failed queries in log lines', () => {
  type LoggedError = { type?: string; message?: string; stack?: string; cause?: LoggedError } & Record<string, unknown>;

  it('must not log the values of a failed query via its error', () => {
    const { logger, lines, parsed } = collectingLogger([]);
    const { secret, reason, sql, error } = failedLookup();

    createLog(logger).error('Unsubscribe failed', { err: error });

    const written = lines.join('\n');
    expect(written).not.toContain(secret);
    expect(written).not.toContain(sql);
    // Positive control: the line keeps what Postgres said, under the error's own name, with its cause.
    const err = parsed()[0]?.err as LoggedError;
    expect(err).toMatchObject({
      type: 'DrizzleQueryError',
      message: reason,
      cause: { message: reason, code: '22021' },
    });
    expect(err.stack).toMatch(/^DrizzleQueryError: invalid byte sequence .*\n {4}at /);
    expect(err).not.toHaveProperty('params');
    expect(err).not.toHaveProperty('query');
  });

  it("must not log the values of a failed query via the database's detail", () => {
    const { logger, lines, parsed } = collectingLogger([]);
    const reason = 'duplicate key value violates unique constraint "emails_email_unique"';
    const { secret, error } = failedLookup((value) =>
      Object.assign(new Error(reason), {
        code: '23505',
        constraint: 'emails_email_unique',
        detail: `Key (email)=(${value}) already exists.`,
        where: `SQL statement "insert into emails values ('${value}')"`,
        internalQuery: `insert into emails values ('${value}')`,
      }),
    );

    createLog(logger).error('Sign-up failed', { err: error });

    expect(lines.join('\n')).not.toContain(secret);
    // Positive control: the reason, the code and the constraint stay.
    const err = parsed()[0]?.err as LoggedError;
    expect(err).toMatchObject({
      message: reason,
      cause: { message: reason, code: '23505', constraint: 'emails_email_unique' },
    });
  });

  it('must not log the values of a failed query via a wrapping error that took over its stack', () => {
    const { logger, lines, parsed } = collectingLogger([]);
    const { secret, reason, error } = failedLookup();
    // An AppError built from `originalError` keeps that error's stack and the database error as its cause.
    const wrapper = Object.assign(new Error('Could not sign in'), { stack: error.stack, cause: error.cause });

    createLog(logger).error('OAuth callback failed', { err: wrapper });

    expect(lines.join('\n')).not.toContain(secret);
    const err = parsed()[0]?.err as LoggedError;
    expect(err).toMatchObject({ message: 'Could not sign in', cause: { message: reason } });
    // Positive control: the stack frames survive.
    expect(err.stack).toMatch(/Failed query: \[REDACTED\]\n {4}at /);
  });

  it('must not log the values of a failed query via an error logged under `error`', () => {
    const { logger, lines, parsed } = collectingLogger([]);
    const { secret, reason, error } = failedLookup();

    createLog(logger).error('Digest failed for recipient', { error, userId: 'u1' });

    expect(lines.join('\n')).not.toContain(secret);
    const [line] = parsed();
    expect(line?.error).toMatchObject({ type: 'DrizzleQueryError', message: reason });
    expect(line?.userId).toBe('u1');
  });
});
