import { createLogger } from 'shared/pino';
import { describe, expect, it } from 'vitest';
import { backendRedactPaths } from '#/lib/pino';

const CENSOR = '[REDACTED]';

/** A logger built through the shared `createLogger` with the backend's own redact paths, writing to memory. */
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

describe('pino log redaction', () => {
  it('redacts sensitive keys at the top level (event meta is spread at the root)', () => {
    const logged = collectLog({
      msg: 'oauth callback',
      token: 'super-secret-token',
      accessToken: 'at_123',
      refreshToken: 'rt_123',
      idToken: 'eyJ.header.sig',
      codeVerifier: 'cv_123',
      sessionToken: 'st_123',
      nonce: 'n_123',
      password: 'hunter2',
    });

    expect(logged.token).toBe(CENSOR);
    expect(logged.accessToken).toBe(CENSOR);
    expect(logged.refreshToken).toBe(CENSOR);
    expect(logged.idToken).toBe(CENSOR);
    expect(logged.codeVerifier).toBe(CENSOR);
    expect(logged.sessionToken).toBe(CENSOR);
    expect(logged.nonce).toBe(CENSOR);
    expect(logged.password).toBe(CENSOR);
  });

  it('redacts sensitive keys nested inside meta objects', () => {
    const logged = collectLog({ msg: 'nested', meta: { token: 'x', secret: 'y', credentialId: 'z' } });
    const meta = logged.meta as Record<string, unknown>;

    expect(meta.token).toBe(CENSOR);
    expect(meta.secret).toBe(CENSOR);
    expect(meta.credentialId).toBe(CENSOR);
  });

  it('redacts every registered secret column, so a logged row leaks no hash', () => {
    const logged = collectLog({
      msg: 'row',
      key: { id: 'k1', hash: 'sha256', secretHash: 'sha256', privateJwk: '{}', singleUseToken: 'h' },
    });
    const key = logged.key as Record<string, unknown>;

    expect(key.id).toBe('k1');
    expect(key.hash).toBe(CENSOR);
    expect(key.secretHash).toBe(CENSOR);
    expect(key.privateJwk).toBe(CENSOR);
    expect(key.singleUseToken).toBe(CENSOR);
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

  it('scrubs a token out of a logged request url', () => {
    const logged = collectLog({ msg: 'GET', url: '/auth/invoke-token/magic/tok_live?next=%2F', status: 302 });

    expect(logged.url).toBe('/auth/invoke-token/magic/[REDACTED]?next=%2F');
    expect(logged.status).toBe(302);
  });

  it('does not redact non-sensitive keys, including websocket close `code`', () => {
    const logged = collectLog({
      msg: 'cdc disconnect',
      code: 1006,
      reason: 'going away',
      provider: 'github',
      userId: 'u1',
    });

    expect(logged.code).toBe(1006);
    expect(logged.reason).toBe('going away');
    expect(logged.provider).toBe('github');
    expect(logged.userId).toBe('u1');
  });
});
