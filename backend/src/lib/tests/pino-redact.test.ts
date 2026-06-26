import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { redactedFields } from '#/lib/pino';

const CENSOR = '[REDACTED]';

/**
 * Build a pino logger that writes to an in-memory buffer using the real
 * `redactedFields` list, so we validate the exact redaction config used in production.
 */
const collectLog = (obj: object): Record<string, unknown> => {
  const lines: string[] = [];
  const stream = { write: (line: string) => lines.push(line) };
  const logger = pino({ redact: { paths: redactedFields, censor: CENSOR } }, stream);
  logger.info(obj);
  return JSON.parse(lines[0]);
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
