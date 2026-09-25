import { describe, expect, it } from 'vitest';
import { createLog, createLogger } from './pino.ts';

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

  it('censors through the level facade the services log with', () => {
    const { logger, parsed } = collectingLogger(['token', '*.token']);

    createLog(logger).warn('oauth callback failed', { token: 'facade_secret', url: '/cb?code=code_secret' });

    const [line] = parsed();
    expect(JSON.stringify(line)).not.toMatch(/facade_secret|code_secret/);
    expect(line?.msg).toBe('oauth callback failed');
  });
});
