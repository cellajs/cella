import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createLog, createLogger } from './pino.ts';

/** The error Drizzle throws for a failed query, as drizzle-orm builds it: the SQL and the values in the message. */
class DrizzleQueryError extends Error {
  query: string;
  params: unknown[];
  constructor(query: string, params: unknown[], cause?: Error) {
    super(`Failed query: ${query}\nparams: ${params}`);
    this.name = 'DrizzleQueryError';
    this.query = query;
    this.params = params;
    this.cause = cause;
  }
}

/** A failed lookup by a secret: what Postgres says about it, and the Drizzle error around it. */
const failedLookup = () => {
  // Built at run time: the tests prove this value never reaches a log line.
  const secret = `secret_${randomUUID()}`;
  const reason = 'invalid byte sequence for encoding "UTF8": 0x00';
  const sql = 'select "id" from "unsubscribe_tokens" where "unsubscribe_tokens"."secret" = $1';
  const error = new DrizzleQueryError(
    sql,
    [`${secret}\nsecond line`],
    Object.assign(new Error(reason), { code: '22021' }),
  );
  return { secret, reason, sql, error };
};

/** A logger built through `createLogger` as the services build theirs, writing its lines to memory. */
const collectingLogger = (redactPaths: readonly string[]) => {
  const lines: string[] = [];
  const logger = createLogger({
    level: 'info',
    isProduction: true,
    isTest: false,
    redactPaths,
    destination: { write: (line: string) => lines.push(line) },
  });
  return { logger, lines, parsed: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>) };
};

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
