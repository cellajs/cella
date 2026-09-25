import { describe, expect, it } from 'vitest';
import { createSecretRedactor } from './secret-redactor';

describe('createSecretRedactor', () => {
  it('replaces a known value wherever it appears and keeps the text around it', () => {
    const redactor = createSecretRedactor();
    redactor.add('cookie-secret-0123456789');

    expect(redactor.redact('rejected cookie-secret-0123456789 at boot; again: cookie-secret-0123456789')).toBe(
      'rejected [REDACTED] at boot; again: [REDACTED]',
    );
  });

  it('redacts the URL-encoded and JSON-escaped forms a value takes in URLs and JSONL', () => {
    const redactor = createSecretRedactor();
    const secret = 'p@ss/word"with\\quote';
    redactor.add(secret);

    expect(redactor.redact(`https://x.example/cb?key=${encodeURIComponent(secret)}`)).not.toContain(
      encodeURIComponent(secret),
    );
    const jsonl = JSON.stringify({ body: `failed: ${secret}` });
    expect(jsonl).not.toContain(secret);
    expect(redactor.redact(jsonl)).toBe(JSON.stringify({ body: 'failed: [REDACTED]' }));
  });

  it("redacts a connection string whole, its password on its own, and any URL's userinfo", () => {
    const redactor = createSecretRedactor();
    redactor.add('postgresql://app:db-password-4711@10.0.0.5:5432/app?sslmode=require');

    expect(redactor.redact('dial postgresql://app:db-password-4711@10.0.0.5:5432/app?sslmode=require')).toBe(
      'dial [REDACTED]',
    );
    expect(redactor.redact('auth failed for password db-password-4711')).toBe('auth failed for password [REDACTED]');
    // Userinfo goes whether or not the value is known: an admin DSN the boot runner never saw.
    expect(redactor.redact('dial postgres://admin:unknown-pw@10.0.0.6/postgres')).toBe(
      'dial postgres://[REDACTED]@10.0.0.6/postgres',
    );
  });

  it('applies values added later to every later call', () => {
    const redactor = createSecretRedactor();
    const line = 'service key svc-secret-key-000111 loaded';
    expect(redactor.redact(line)).toBe(line);

    redactor.add('svc-secret-key-000111');
    expect(redactor.redact(line)).toBe('service key [REDACTED] loaded');
  });

  it('ignores empty and short values, which would match ordinary words', () => {
    const redactor = createSecretRedactor();
    redactor.add(undefined, '', 'true', 'prod');

    expect(redactor.redact('true in prod')).toBe('true in prod');
  });
});
