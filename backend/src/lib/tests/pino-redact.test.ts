import { createLogger } from 'shared/pino';
import { describe, expect, it } from 'vitest';
import { backendRedactPaths } from '#/lib/pino';

const CENSOR = '[REDACTED]';

/**
 * A logger built through the shared `createLogger` with the backend's own redact paths, writing to memory. The app's
 * loggers are built the same way (`redactPaths` is a required option) and stay silent under test, so this file proves
 * the backend's paths; shared/src/pino.test.ts proves the logger.
 */
const collectLog = (obj: object): Record<string, unknown> => {
  const lines: string[] = [];
  const logger = createLogger({
    level: 'info',
    isProduction: true,
    isTest: false,
    redactPaths: backendRedactPaths,
    destination: { write: (line: string) => lines.push(line) },
  });
  logger.info(obj);
  return JSON.parse(lines[0]!);
};

describe('backend log redaction paths', () => {
  it('censors secret columns and transport keys at the root and one level deep, and nothing else', () => {
    const logged = collectLog({
      msg: 'oauth callback',
      token: 'super-secret-token',
      meta: { secret: 'y', credentialId: 'z' },
      key: { id: 'k1', hash: 'sha256', privateJwk: '{}' },
      // The websocket close code, a provider name and ids stay readable.
      code: 1006,
      provider: 'github',
      userId: 'u1',
    });

    expect(logged.token).toBe(CENSOR);
    expect(logged.meta).toEqual({ secret: CENSOR, credentialId: CENSOR });
    expect(logged.key).toEqual({ id: 'k1', hash: CENSOR, privateJwk: CENSOR });
    expect(logged).toMatchObject({ code: 1006, provider: 'github', userId: 'u1' });
  });

  it('redacts the auth headers of a logged request', () => {
    const logged = collectLog({
      msg: 'req',
      req: { headers: { authorization: 'Bearer sk_live', cookie: 'app-session=abc', 'user-agent': 'ua' } },
    });
    const headers = (logged.req as { headers: Record<string, unknown> }).headers;

    expect(headers.authorization).toBe(CENSOR);
    expect(headers.cookie).toBe(CENSOR);
    expect(headers['user-agent']).toBe('ua');
  });
});
